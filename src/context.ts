import { readFile } from "node:fs/promises";
import path from "node:path";

import { effectiveAgentPolicy } from "./config.js";
import { readDiagramMetadata, sourceHash } from "./diagrams.js";
import { collectDiagramSources } from "./project.js";
import { parseArchitectureRecords } from "./records.js";
import { reviewArchitecture } from "./review.js";
import type {
  ArchitectureContext,
  ArchitectureStatus,
  Diagnostic,
  ParsedArchitecture,
  ResolvedArchitectureConfig,
} from "./types.js";
import { validateProject } from "./validation.js";

function portableRelative(root: string, target: string): string {
  const relative = path.relative(root, target).replaceAll("\\", "/");
  return relative === "" ? "." : relative;
}

function headingName(value: string): string {
  return value
    .replace(/^\d+(?:\.\d+)*\.?\s+/, "")
    .trim()
    .toLowerCase();
}

function hasHeading(parsed: ParsedArchitecture, terms: string[]): boolean {
  const names = parsed.headings.map((heading) => headingName(heading.text));
  return terms.some((term) => names.some((name) => name.includes(term)));
}

function hasDiagram(diagrams: ArchitectureContext["diagrams"], terms: string[]): boolean {
  return terms.some((term) => diagrams.some((diagram) => diagram.name.includes(term)));
}

export async function createArchitectureContext(
  parsed: ParsedArchitecture,
  config: ResolvedArchitectureConfig,
  includeSource = false,
): Promise<{ context: ArchitectureContext; diagnostics: Diagnostic[] }> {
  const [diagnostics, diagramSources] = await Promise.all([
    validateProject(parsed, config, false),
    collectDiagramSources(config.diagramSourcePath),
  ]);
  const recordResult = parseArchitectureRecords(parsed);
  const review = reviewArchitecture(parsed, diagramSources);
  const diagrams: ArchitectureContext["diagrams"] = [];

  for (const source of diagramSources) {
    const relativeStem = portableRelative(config.diagramSourcePath, source).replace(
      /\.drawio$/i,
      "",
    );
    const preview = path.join(config.diagramRenderedPath, `${relativeStem}.png`);
    let previewHash: string | undefined;
    let valid = false;
    try {
      const [drawio, png] = await Promise.all([readFile(source), readFile(preview)]);
      const metadata = readDiagramMetadata(png);
      previewHash = metadata.sourceHash;
      valid =
        metadata.sourceHash === sourceHash(drawio) && metadata.mxfile === drawio.toString("utf8");
    } catch {
      valid = false;
    }
    diagrams.push({
      name: relativeStem,
      source: portableRelative(config.projectDir, source),
      preview: portableRelative(config.projectDir, preview),
      ...(previewHash ? { sourceHash: previewHash } : {}),
      valid,
    });
  }

  const context: ArchitectureContext = {
    metadata: {
      title: config.document.title,
      author: config.document.author,
      ...(config.document.subject ? { subject: config.document.subject } : {}),
      keywords: [...config.document.keywords].sort(),
    },
    paths: {
      config: portableRelative(config.projectDir, config.configPath),
      source: portableRelative(config.projectDir, config.sourcePath),
      output: portableRelative(config.projectDir, config.outputPath),
      diagramSource: portableRelative(config.projectDir, config.diagramSourcePath),
      diagramRendered: portableRelative(config.projectDir, config.diagramRenderedPath),
    },
    outline: parsed.headings.map((heading) => ({
      level: heading.level,
      text: heading.text,
      bookmark: heading.bookmark,
      line: heading.line,
    })),
    records: recordResult.records,
    diagrams: diagrams.sort((left, right) => left.name.localeCompare(right.name)),
    policy: effectiveAgentPolicy(config),
    review,
    ...(includeSource ? { source: parsed.source } : {}),
  };
  return { context, diagnostics };
}

function phase(name: ArchitectureStatus["phases"][number]["name"], blockers: string[]) {
  return { name, ready: blockers.length === 0, blockers };
}

export function createArchitectureStatus(
  parsed: ParsedArchitecture,
  context: ArchitectureContext,
  diagnostics: Diagnostic[],
  strictDiagnostics: Diagnostic[],
): ArchitectureStatus {
  const errors = diagnostics.filter((diagnostic) => diagnostic.severity === "error");
  const strictErrors = strictDiagnostics.filter((diagnostic) => diagnostic.severity === "error");
  const pendingApprovals = [
    ...context.records.decisions
      .filter((record) => record.status === "proposed")
      .map((record) => ({ id: record.id, kind: "decision" as const, status: record.status })),
    ...context.records.decisions
      .filter((record) => record.status === "accepted" && record.approvedBy.trim() === "")
      .map((record) => ({ id: record.id, kind: "decision" as const, status: record.status })),
    ...context.records.risks
      .filter((record) => record.status === "accepted" && record.approvedBy.trim() === "")
      .map((record) => ({ id: record.id, kind: "risk" as const, status: record.status })),
  ].sort((left, right) => left.id.localeCompare(right.id));

  const discoverBlockers: string[] = [];
  if (!hasHeading(parsed, ["scope and audience"])) discoverBlockers.push("Add scope and audience.");
  if (context.records.requirements.length === 0)
    discoverBlockers.push("Add at least one REQ record.");
  if (context.records.assumptions.length === 0)
    discoverBlockers.push("Add at least one ASM record.");

  const designBlockers: string[] = [];
  if (!hasHeading(parsed, ["architecture overview"]))
    designBlockers.push("Add architecture overview.");
  if (!hasDiagram(context.diagrams, ["context"])) designBlockers.push("Add a context diagram.");
  if (!hasDiagram(context.diagrams, ["domain"])) designBlockers.push("Add a domain diagram.");

  const specifyBlockers: string[] = [];
  if (!hasHeading(parsed, ["runtime flows"])) specifyBlockers.push("Specify runtime flows.");
  if (!hasHeading(parsed, ["api and data contracts"]))
    specifyBlockers.push("Specify API contracts.");
  if (!hasDiagram(context.diagrams, ["sequence"])) specifyBlockers.push("Add a sequence diagram.");
  if (!hasDiagram(context.diagrams, ["state"])) specifyBlockers.push("Add a state diagram.");

  const critiqueBlockers: string[] = [];
  if (errors.length > 0) critiqueBlockers.push(`Resolve ${errors.length} validation error(s).`);
  if (context.review.percentage < 75) critiqueBlockers.push("Reach at least 75% review coverage.");

  const reviseBlockers: string[] = [];
  if (strictErrors.length > 0)
    reviseBlockers.push(`Resolve ${strictErrors.length} strict issue(s).`);
  if (context.review.percentage < 90) reviseBlockers.push("Reach at least 90% review coverage.");

  const approveBlockers = pendingApprovals.map(
    (record) => `${record.id} requires a human approval decision.`,
  );
  const discoverPhase = phase("discover", discoverBlockers);
  const designPhase = phase("design", [
    ...(discoverPhase.ready ? [] : ["Complete the discover phase."]),
    ...designBlockers,
  ]);
  const specifyPhase = phase("specify", [
    ...(designPhase.ready ? [] : ["Complete the design phase."]),
    ...specifyBlockers,
  ]);
  const critiquePhase = phase("critique", [
    ...(specifyPhase.ready ? [] : ["Complete the specify phase."]),
    ...critiqueBlockers,
  ]);
  const revisePhase = phase("revise", [
    ...(critiquePhase.ready ? [] : ["Complete the critique phase."]),
    ...reviseBlockers,
  ]);
  const approvePhase = phase("approve", [
    ...(revisePhase.ready ? [] : ["Complete the revise phase."]),
    ...approveBlockers,
  ]);
  const publishBlockers = approvePhase.ready ? [] : ["Complete the approve phase."];
  if (context.diagrams.some((diagram) => !diagram.valid)) {
    publishBlockers.push("Refresh or repair invalid diagram previews.");
  }

  const phases = [
    discoverPhase,
    designPhase,
    specifyPhase,
    critiquePhase,
    revisePhase,
    approvePhase,
    phase("publish", publishBlockers),
  ];
  const nextActions = phases
    .filter((item) => !item.ready)
    .flatMap((item) => item.blockers.map((blocker) => `${item.name}: ${blocker}`));
  return {
    phases,
    readyToPublish: phases.find((item) => item.name === "publish")?.ready ?? false,
    pendingApprovals,
    nextActions,
  };
}
