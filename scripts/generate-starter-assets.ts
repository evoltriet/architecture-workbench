import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

import { canonicalizeDrawioXml, embedDiagramMetadata } from "../src/diagrams.js";

type NodeKind = "component" | "managed" | "store" | "human" | "failure" | "boundary" | "decision";

type DiagramNode = {
  id: string;
  title: string;
  lines: string[];
  x: number;
  y: number;
  width: number;
  height: number;
  kind?: NodeKind;
};

type DiagramEdge = {
  source: string;
  target: string;
  label?: string;
};

type Diagram = {
  stem: string;
  title: string;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
};

const colors: Record<NodeKind, { fill: string; stroke: string }> = {
  component: { fill: "#EAF4F8", stroke: "#347A9B" },
  managed: { fill: "#FFF3DF", stroke: "#CF7A21" },
  store: { fill: "#EEF4E5", stroke: "#6F934A" },
  human: { fill: "#FFF3DF", stroke: "#CF7A21" },
  failure: { fill: "#FBE9E7", stroke: "#B6534D" },
  boundary: { fill: "#F8FAFB", stroke: "#A6BBC6" },
  decision: { fill: "#FFF3DF", stroke: "#CF7A21" },
};

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function drawioStyle(kind: NodeKind): string {
  const color = colors[kind];
  if (kind === "boundary") {
    return `rounded=0;whiteSpace=wrap;html=1;fillColor=${color.fill};strokeColor=${color.stroke};fontColor=#294A5A;fontFamily=Arial;fontSize=14;strokeWidth=2;dashed=1;`;
  }
  if (kind === "decision") {
    return `rhombus;whiteSpace=wrap;html=1;fillColor=${color.fill};strokeColor=${color.stroke};fontColor=#173042;fontFamily=Arial;fontSize=13;strokeWidth=2;`;
  }
  return `rounded=1;whiteSpace=wrap;html=1;arcSize=12;fillColor=${color.fill};strokeColor=${color.stroke};fontColor=#173042;fontFamily=Arial;fontSize=14;strokeWidth=2;`;
}

function drawioLabel(node: DiagramNode): string {
  return `<b>${escapeXml(node.title)}</b>${node.lines.length > 0 ? `<br>${node.lines.map(escapeXml).join("<br>")}` : ""}`;
}

function makeDrawio(diagram: Diagram): string {
  const nodes = diagram.nodes
    .map(
      (node) =>
        `<mxCell id="${node.id}" value="${escapeXml(drawioLabel(node))}" style="${drawioStyle(node.kind ?? "component")}" vertex="1" parent="1"><mxGeometry x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}" as="geometry"/></mxCell>`,
    )
    .join("");
  const edges = diagram.edges
    .map(
      (edge, index) =>
        `<mxCell id="edge-${index + 1}" value="${escapeXml(edge.label ?? "")}" style="endArrow=block;html=1;rounded=0;strokeWidth=2;strokeColor=#567786;fontFamily=Arial;fontSize=12;" edge="1" parent="1" source="${edge.source}" target="${edge.target}"><mxGeometry relative="1" as="geometry"/></mxCell>`,
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?><mxfile host="app.diagrams.net" agent="architecture-workbench" version="24.7.17" type="device"><diagram id="${diagram.stem}" name="${escapeXml(diagram.title)}"><mxGraphModel dx="1600" dy="900" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1600" pageHeight="900" math="0" shadow="0"><root><mxCell id="0"/><mxCell id="1" parent="0"/>${nodes}${edges}</root></mxGraphModel></diagram></mxfile>`;
}

function nodeCenter(node: DiagramNode): { x: number; y: number } {
  return { x: node.x + node.width / 2, y: node.y + node.height / 2 };
}

function svgNode(node: DiagramNode): string {
  const color = colors[node.kind ?? "component"];
  const titleY = node.y + 33;
  const body = node.lines
    .map(
      (line, index) =>
        `<text x="${node.x + node.width / 2}" y="${titleY + 31 + index * 22}" text-anchor="middle" font-family="Arial" font-size="15" fill="#294A5A">${escapeXml(line)}</text>`,
    )
    .join("");
  if (node.kind === "decision") {
    const points = `${node.x + node.width / 2},${node.y} ${node.x + node.width},${node.y + node.height / 2} ${node.x + node.width / 2},${node.y + node.height} ${node.x},${node.y + node.height / 2}`;
    return `<polygon points="${points}" fill="${color.fill}" stroke="${color.stroke}" stroke-width="3"/><text x="${node.x + node.width / 2}" y="${node.y + node.height / 2 + 5}" text-anchor="middle" font-family="Arial" font-size="17" font-weight="700" fill="#173042">${escapeXml(node.title)}</text>`;
  }
  return `<rect x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}" rx="${node.kind === "boundary" ? 0 : 16}" fill="${color.fill}" stroke="${color.stroke}" stroke-width="3" ${node.kind === "boundary" ? 'stroke-dasharray="10 8"' : ""}/><text x="${node.x + node.width / 2}" y="${titleY}" text-anchor="middle" font-family="Arial" font-size="19" font-weight="700" fill="#173042">${escapeXml(node.title)}</text>${body}`;
}

function svgEdge(edge: DiagramEdge, nodes: Map<string, DiagramNode>): string {
  const source = nodes.get(edge.source);
  const target = nodes.get(edge.target);
  if (!source || !target) throw new Error(`Unknown edge endpoint ${edge.source} -> ${edge.target}`);
  const from = nodeCenter(source);
  const to = nodeCenter(target);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const horizontal = Math.abs(dx) >= Math.abs(dy);
  const x1 = horizontal ? from.x + (Math.sign(dx) * source.width) / 2 : from.x;
  const y1 = horizontal ? from.y : from.y + (Math.sign(dy) * source.height) / 2;
  const x2 = horizontal ? to.x - (Math.sign(dx) * target.width) / 2 : to.x;
  const y2 = horizontal ? to.y : to.y - (Math.sign(dy) * target.height) / 2;
  const label = edge.label
    ? `<rect x="${(x1 + x2) / 2 - 72}" y="${(y1 + y2) / 2 - 20}" width="144" height="25" fill="#FFFFFF" opacity="0.92"/><text x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2 - 2}" text-anchor="middle" font-family="Arial" font-size="13" fill="#496675">${escapeXml(edge.label)}</text>`
    : "";
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#567786" stroke-width="3" marker-end="url(#arrow)"/>${label}`;
}

function makeSvg(diagram: Diagram): string {
  const nodes = new Map(diagram.nodes.map((node) => [node.id, node]));
  const boundaries = diagram.nodes
    .filter((node) => node.kind === "boundary")
    .map(svgNode)
    .join("");
  const edges = diagram.edges.map((edge) => svgEdge(edge, nodes)).join("");
  const foreground = diagram.nodes
    .filter((node) => node.kind !== "boundary")
    .map(svgNode)
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900"><rect width="1600" height="900" fill="#FFFFFF"/><defs><marker id="arrow" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto"><path d="M0,0 L10,4 L0,8 Z" fill="#567786"/></marker></defs><text x="800" y="65" text-anchor="middle" font-family="Arial" font-size="34" font-weight="700" fill="#123B52">${escapeXml(diagram.title)}</text>${boundaries}${edges}${foreground}</svg>`;
}

const diagrams: Diagram[] = [
  {
    stem: "system-context",
    title: "Service Fulfillment System Context",
    nodes: [
      {
        id: "caller",
        title: "Client",
        lines: ["Submit request", "Track and cancel"],
        x: 80,
        y: 300,
        width: 220,
        height: 125,
      },
      {
        id: "api",
        title: "Fulfillment API",
        lines: ["Admission", "Operation contract"],
        x: 390,
        y: 285,
        width: 240,
        height: 145,
      },
      {
        id: "workflow",
        title: "Workflow Engine",
        lines: ["Durable state", "Policy and checkpoints"],
        x: 720,
        y: 270,
        width: 260,
        height: 165,
      },
      {
        id: "worker",
        title: "Execution Worker",
        lines: ["Deterministic steps", "Bounded retries"],
        x: 1070,
        y: 285,
        width: 245,
        height: 145,
      },
      {
        id: "provider",
        title: "External Provider",
        lines: ["Fulfillment endpoint", "Confirmation result"],
        x: 1330,
        y: 285,
        width: 220,
        height: 145,
        kind: "managed",
      },
      {
        id: "events",
        title: "Events and Audit",
        lines: ["Ordered progress", "Immutable decisions"],
        x: 450,
        y: 590,
        width: 260,
        height: 135,
        kind: "store",
      },
      {
        id: "review",
        title: "Human Review",
        lines: ["Resolve ambiguity", "Resume or cancel"],
        x: 900,
        y: 590,
        width: 245,
        height: 135,
        kind: "human",
      },
    ],
    edges: [
      { source: "caller", target: "api" },
      { source: "api", target: "workflow" },
      { source: "workflow", target: "worker" },
      { source: "worker", target: "provider" },
      { source: "workflow", target: "events", label: "progress" },
      { source: "workflow", target: "review", label: "policy gate" },
    ],
  },
  {
    stem: "domain-model",
    title: "Fulfillment Domain Model",
    nodes: [
      {
        id: "operation",
        title: "FulfillmentOperation",
        lines: ["operationId", "state", "requestor"],
        x: 80,
        y: 170,
        width: 255,
        height: 150,
      },
      {
        id: "route",
        title: "RouteKey",
        lines: ["serviceType", "provider", "tenant"],
        x: 410,
        y: 170,
        width: 230,
        height: 145,
      },
      {
        id: "binding",
        title: "ProcedureBinding",
        lines: ["route", "version", "rollout"],
        x: 715,
        y: 170,
        width: 250,
        height: 145,
        kind: "store",
      },
      {
        id: "procedure",
        title: "ProcedureVersion",
        lines: ["steps", "requirements", "policy"],
        x: 1040,
        y: 170,
        width: 250,
        height: 145,
        kind: "store",
      },
      {
        id: "checkpoint",
        title: "Checkpoint",
        lines: ["stage", "state reference", "sequence"],
        x: 80,
        y: 500,
        width: 250,
        height: 145,
        kind: "store",
      },
      {
        id: "event",
        title: "AuditEvent",
        lines: ["actor", "decision", "timestamp"],
        x: 410,
        y: 500,
        width: 230,
        height: 145,
        kind: "store",
      },
      {
        id: "failure",
        title: "FailureClass",
        lines: ["transient", "deterministic", "ambiguous"],
        x: 715,
        y: 500,
        width: 250,
        height: 145,
        kind: "failure",
      },
      {
        id: "task",
        title: "ReviewTask",
        lines: ["reason", "allowed actions", "decision"],
        x: 1040,
        y: 500,
        width: 250,
        height: 145,
        kind: "human",
      },
      {
        id: "policy",
        title: "PolicySet",
        lines: ["retry budget", "human gates", "evidence"],
        x: 1340,
        y: 335,
        width: 210,
        height: 150,
        kind: "managed",
      },
    ],
    edges: [
      { source: "operation", target: "route", label: "uses" },
      { source: "route", target: "binding", label: "resolves" },
      { source: "binding", target: "procedure", label: "pins" },
      { source: "operation", target: "checkpoint", label: "writes" },
      { source: "operation", target: "event", label: "emits" },
      { source: "operation", target: "failure", label: "classifies" },
      { source: "failure", target: "task", label: "may create" },
      { source: "procedure", target: "policy", label: "governed by" },
    ],
  },
  {
    stem: "sequence-happy-path",
    title: "Happy-Path Backend Sequence",
    nodes: [
      {
        id: "client",
        title: "1. Client",
        lines: ["Create operation"],
        x: 55,
        y: 250,
        width: 190,
        height: 105,
      },
      {
        id: "api",
        title: "2. API",
        lines: ["Validate and accept"],
        x: 300,
        y: 250,
        width: 190,
        height: 105,
      },
      {
        id: "workflow",
        title: "3. Workflow",
        lines: ["Resolve procedure"],
        x: 545,
        y: 250,
        width: 200,
        height: 105,
      },
      {
        id: "queue",
        title: "4. Queue",
        lines: ["Apply backpressure"],
        x: 800,
        y: 250,
        width: 190,
        height: 105,
        kind: "store",
      },
      {
        id: "worker",
        title: "5. Worker",
        lines: ["Execute steps"],
        x: 1045,
        y: 250,
        width: 190,
        height: 105,
      },
      {
        id: "provider",
        title: "6. Provider",
        lines: ["Confirm outcome"],
        x: 1290,
        y: 250,
        width: 210,
        height: 105,
        kind: "managed",
      },
      {
        id: "events",
        title: "Status Stream",
        lines: ["Accepted", "Running", "Succeeded"],
        x: 440,
        y: 565,
        width: 230,
        height: 140,
        kind: "store",
      },
      {
        id: "audit",
        title: "Audit Store",
        lines: ["Actor", "Procedure version", "Outcome"],
        x: 930,
        y: 565,
        width: 230,
        height: 140,
        kind: "store",
      },
    ],
    edges: [
      { source: "client", target: "api", label: "request" },
      { source: "api", target: "workflow", label: "operationId" },
      { source: "workflow", target: "queue" },
      { source: "queue", target: "worker" },
      { source: "worker", target: "provider", label: "execute" },
      { source: "workflow", target: "events", label: "progress" },
      { source: "worker", target: "audit", label: "result" },
    ],
  },
  {
    stem: "sequence-failure",
    title: "Failure and Human Review Sequence",
    nodes: [
      {
        id: "worker",
        title: "Worker",
        lines: ["Detect non-success"],
        x: 80,
        y: 230,
        width: 230,
        height: 120,
      },
      {
        id: "classify",
        title: "Failure Classifier",
        lines: ["Safe to retry?", "Ambiguous outcome?"],
        x: 390,
        y: 215,
        width: 250,
        height: 150,
        kind: "failure",
      },
      {
        id: "workflow",
        title: "Workflow",
        lines: ["Persist checkpoint", "Emit state"],
        x: 730,
        y: 230,
        width: 240,
        height: 130,
      },
      {
        id: "review",
        title: "Human Review",
        lines: ["Inspect evidence", "Resume or cancel"],
        x: 1060,
        y: 215,
        width: 250,
        height: 150,
        kind: "human",
      },
      {
        id: "client",
        title: "Client",
        lines: ["Receive explanation", "Observe terminal state"],
        x: 1370,
        y: 230,
        width: 190,
        height: 130,
      },
      {
        id: "incident",
        title: "Route Incident",
        lines: ["Deduplicate", "Quarantine if needed"],
        x: 560,
        y: 590,
        width: 250,
        height: 140,
        kind: "failure",
      },
      {
        id: "evidence",
        title: "Evidence Store",
        lines: ["Redacted trace", "Integrity hash"],
        x: 930,
        y: 590,
        width: 240,
        height: 140,
        kind: "store",
      },
    ],
    edges: [
      { source: "worker", target: "classify" },
      { source: "classify", target: "workflow", label: "classification" },
      { source: "workflow", target: "review", label: "ambiguous" },
      { source: "review", target: "client", label: "resolved" },
      { source: "classify", target: "incident", label: "repeatable" },
      { source: "workflow", target: "evidence", label: "preserve" },
    ],
  },
  {
    stem: "operation-state",
    title: "Fulfillment Operation State Model",
    nodes: [
      { id: "accepted", title: "Accepted", lines: [], x: 80, y: 180, width: 180, height: 90 },
      { id: "queued", title: "Queued", lines: [], x: 330, y: 180, width: 180, height: 90 },
      { id: "running", title: "Running", lines: [], x: 580, y: 180, width: 180, height: 90 },
      {
        id: "waiting",
        title: "WaitingForHuman",
        lines: [],
        x: 850,
        y: 180,
        width: 230,
        height: 90,
        kind: "human",
      },
      {
        id: "succeeded",
        title: "Succeeded",
        lines: [],
        x: 1160,
        y: 130,
        width: 190,
        height: 90,
        kind: "store",
      },
      {
        id: "failed",
        title: "Failed",
        lines: [],
        x: 1160,
        y: 300,
        width: 190,
        height: 90,
        kind: "failure",
      },
      {
        id: "cancel",
        title: "CancelRequested",
        lines: [],
        x: 580,
        y: 480,
        width: 220,
        height: 90,
        kind: "managed",
      },
      {
        id: "canceled",
        title: "Canceled",
        lines: [],
        x: 920,
        y: 480,
        width: 190,
        height: 90,
        kind: "failure",
      },
      {
        id: "rejected",
        title: "Rejected",
        lines: ["Unsupported or invalid"],
        x: 180,
        y: 480,
        width: 220,
        height: 115,
        kind: "failure",
      },
      {
        id: "stream",
        title: "Every transition emits",
        lines: ["sequence", "timestamp", "redacted message"],
        x: 1230,
        y: 560,
        width: 270,
        height: 145,
        kind: "store",
      },
    ],
    edges: [
      { source: "accepted", target: "queued" },
      { source: "queued", target: "running" },
      { source: "running", target: "waiting", label: "policy or ambiguity" },
      { source: "waiting", target: "running", label: "resume" },
      { source: "running", target: "succeeded" },
      { source: "running", target: "failed" },
      { source: "running", target: "cancel" },
      { source: "cancel", target: "canceled" },
      { source: "accepted", target: "rejected" },
      { source: "failed", target: "stream" },
    ],
  },
  {
    stem: "retry-escalation",
    title: "Retry and Escalation Policy",
    nodes: [
      {
        id: "failure",
        title: "Failure",
        lines: ["Classify once"],
        x: 80,
        y: 320,
        width: 200,
        height: 110,
        kind: "failure",
      },
      {
        id: "safe",
        title: "Safe to retry?",
        lines: [],
        x: 370,
        y: 285,
        width: 210,
        height: 180,
        kind: "decision",
      },
      {
        id: "budget",
        title: "Budget remains?",
        lines: [],
        x: 680,
        y: 285,
        width: 210,
        height: 180,
        kind: "decision",
      },
      {
        id: "retry",
        title: "Bounded Retry",
        lines: ["Backoff and jitter", "Same checkpoint"],
        x: 1000,
        y: 155,
        width: 240,
        height: 135,
        kind: "managed",
      },
      {
        id: "quarantine",
        title: "Route Quarantine",
        lines: ["Stop new admissions", "Protect other routes"],
        x: 1000,
        y: 455,
        width: 250,
        height: 145,
        kind: "failure",
      },
      {
        id: "human",
        title: "Human Review",
        lines: ["Ambiguous or irreversible", "No automatic retry"],
        x: 1320,
        y: 155,
        width: 240,
        height: 145,
        kind: "human",
      },
      {
        id: "incident",
        title: "Repair Incident",
        lines: ["Canonical signature", "Owner and priority"],
        x: 1320,
        y: 455,
        width: 240,
        height: 145,
        kind: "failure",
      },
      {
        id: "terminal",
        title: "Terminal Explanation",
        lines: ["Reason", "Attempt count", "Next action"],
        x: 650,
        y: 650,
        width: 250,
        height: 140,
        kind: "store",
      },
    ],
    edges: [
      { source: "failure", target: "safe" },
      { source: "safe", target: "budget", label: "yes" },
      { source: "budget", target: "retry", label: "yes" },
      { source: "retry", target: "safe", label: "re-evaluate" },
      { source: "safe", target: "quarantine", label: "deterministic" },
      { source: "budget", target: "quarantine", label: "exhausted" },
      { source: "quarantine", target: "incident" },
      { source: "safe", target: "human", label: "ambiguous" },
      { source: "quarantine", target: "terminal" },
      { source: "human", target: "terminal" },
    ],
  },
  {
    stem: "trust-boundary",
    title: "Trust Boundaries and Data Flow",
    nodes: [
      {
        id: "private",
        title: "Private service boundary",
        lines: [],
        x: 55,
        y: 130,
        width: 900,
        height: 650,
        kind: "boundary",
      },
      {
        id: "external",
        title: "External provider boundary",
        lines: [],
        x: 1030,
        y: 130,
        width: 515,
        height: 650,
        kind: "boundary",
      },
      {
        id: "edge",
        title: "API Edge",
        lines: ["Authentication", "Rate limits"],
        x: 100,
        y: 250,
        width: 220,
        height: 130,
      },
      {
        id: "workflow",
        title: "Workflow",
        lines: ["Minimized payload", "Policy enforcement"],
        x: 390,
        y: 250,
        width: 235,
        height: 140,
      },
      {
        id: "worker",
        title: "Worker",
        lines: ["Short-lived credentials", "Allowlisted destination"],
        x: 690,
        y: 250,
        width: 230,
        height: 150,
      },
      {
        id: "store",
        title: "Encrypted Stores",
        lines: ["Operation state", "Audit and evidence"],
        x: 250,
        y: 540,
        width: 250,
        height: 145,
        kind: "store",
      },
      {
        id: "identity",
        title: "Identity and Keys",
        lines: ["Least privilege", "Rotation"],
        x: 640,
        y: 540,
        width: 230,
        height: 135,
        kind: "managed",
      },
      {
        id: "provider",
        title: "Provider API",
        lines: ["External data processor", "Independent availability"],
        x: 1110,
        y: 260,
        width: 250,
        height: 145,
        kind: "managed",
      },
      {
        id: "externalStore",
        title: "Provider Record",
        lines: ["Authoritative outcome"],
        x: 1190,
        y: 560,
        width: 230,
        height: 120,
        kind: "store",
      },
    ],
    edges: [
      { source: "edge", target: "workflow", label: "validated request" },
      { source: "workflow", target: "worker", label: "procedure input" },
      { source: "worker", target: "provider", label: "TLS" },
      { source: "workflow", target: "store", label: "encrypted" },
      { source: "identity", target: "worker", label: "credentials" },
      { source: "provider", target: "externalStore" },
    ],
  },
  {
    stem: "reference-deployment",
    title: "Reference Queue-Backed Deployment",
    nodes: [
      {
        id: "vpc",
        title: "Application network boundary",
        lines: [],
        x: 45,
        y: 125,
        width: 1100,
        height: 665,
        kind: "boundary",
      },
      {
        id: "client",
        title: "Clients",
        lines: ["Web and API"],
        x: 85,
        y: 250,
        width: 180,
        height: 110,
      },
      {
        id: "gateway",
        title: "Gateway",
        lines: ["TLS and auth"],
        x: 325,
        y: 250,
        width: 190,
        height: 110,
      },
      {
        id: "api",
        title: "Stateless API",
        lines: ["Scale on requests"],
        x: 575,
        y: 250,
        width: 210,
        height: 110,
      },
      {
        id: "workflow",
        title: "Workflow Service",
        lines: ["Durable orchestration"],
        x: 845,
        y: 250,
        width: 230,
        height: 110,
      },
      {
        id: "queue",
        title: "Execution Queue",
        lines: ["Backpressure", "Dead letters"],
        x: 575,
        y: 505,
        width: 220,
        height: 130,
        kind: "store",
      },
      {
        id: "workers",
        title: "Worker Pool",
        lines: ["Scale on concurrency", "Route bulkheads"],
        x: 855,
        y: 500,
        width: 230,
        height: 140,
      },
      {
        id: "data",
        title: "State and Audit",
        lines: ["Multi-zone", "Point-in-time recovery"],
        x: 200,
        y: 565,
        width: 250,
        height: 140,
        kind: "store",
      },
      {
        id: "provider",
        title: "External Providers",
        lines: ["Allowlisted endpoints", "Independent quotas"],
        x: 1270,
        y: 330,
        width: 250,
        height: 145,
        kind: "managed",
      },
      {
        id: "observe",
        title: "Observability",
        lines: ["Metrics", "Traces", "Alerts"],
        x: 1220,
        y: 600,
        width: 230,
        height: 135,
        kind: "store",
      },
    ],
    edges: [
      { source: "client", target: "gateway" },
      { source: "gateway", target: "api" },
      { source: "api", target: "workflow" },
      { source: "workflow", target: "queue" },
      { source: "queue", target: "workers" },
      { source: "workers", target: "provider" },
      { source: "workflow", target: "data" },
      { source: "workers", target: "observe" },
    ],
  },
];

async function writeDiagram(root: string, diagram: Diagram): Promise<void> {
  const sourceDir = path.join(root, "diagrams");
  const renderedDir = path.join(sourceDir, "rendered");
  await mkdir(renderedDir, { recursive: true });
  const drawioPath = path.join(sourceDir, `${diagram.stem}.drawio`);
  const pngPath = path.join(renderedDir, `${diagram.stem}.png`);
  await writeFile(drawioPath, canonicalizeDrawioXml(makeDrawio(diagram)), "utf8");
  await sharp(Buffer.from(makeSvg(diagram)))
    .png()
    .toFile(pngPath);
  await embedDiagramMetadata(pngPath, drawioPath);
}

for (const root of ["templates/service", "examples/service-fulfillment"]) {
  for (const diagram of diagrams) await writeDiagram(root, diagram);
}

process.stdout.write(`Generated ${diagrams.length} editable diagram pairs in each project.\n`);
