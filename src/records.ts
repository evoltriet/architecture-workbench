import { inlineText } from "./markdown.js";
import type {
  ArchitectureRecord,
  ArchitectureRecords,
  ApprovalTransition,
  AssumptionStatus,
  DecisionRecord,
  DecisionStatus,
  Diagnostic,
  EvidenceRecord,
  ParsedArchitecture,
  RequirementStatus,
  RiskRecord,
  RiskStatus,
} from "./types.js";

const RECORD_PATTERNS = {
  requirement: /^REQ-\d{3,}$/,
  assumption: /^ASM-\d{3,}$/,
  decision: /^ADR-\d{3,}$/,
  risk: /^RSK-\d{3,}$/,
  evidence: /^EVD-\d{3,}$/,
} as const;

const RECORD_PREFIXES = {
  requirement: "REQ",
  assumption: "ASM",
  decision: "ADR",
  risk: "RSK",
  evidence: "EVD",
} as const;

const STATUSES = {
  requirement: new Set<RequirementStatus>(["proposed", "accepted", "verified", "retired"]),
  assumption: new Set<AssumptionStatus>(["open", "validated", "invalidated", "retired"]),
  decision: new Set<DecisionStatus>(["proposed", "accepted", "rejected", "superseded"]),
  risk: new Set<RiskStatus>(["open", "mitigated", "accepted", "closed"]),
} as const;

const EXPECTED_HEADERS = {
  requirement: ["id", "requirement", "source", "owner", "verification", "status"],
  assumption: ["id", "assumption", "evidence needed", "owner", "review trigger", "status"],
  decision: ["id", "decision", "rationale", "consequences", "status", "owner", "approved by"],
  risk: ["id", "risk", "likelihood", "impact", "mitigation", "owner", "status", "approved by"],
  evidence: ["id", "supports", "source", "retrieved on", "notes"],
} as const;

type RecordKind = keyof typeof EXPECTED_HEADERS;

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

function tableKind(headers: string[]): RecordKind | undefined {
  if (headers[0] !== "id") return undefined;
  if (headers.includes("requirement")) return "requirement";
  if (headers.includes("assumption")) return "assumption";
  if (headers.includes("decision")) return "decision";
  if (headers.includes("risk")) return "risk";
  if (headers.includes("supports")) return "evidence";
  return undefined;
}

function emptyRecords(): ArchitectureRecords {
  return { requirements: [], assumptions: [], decisions: [], risks: [], evidence: [] };
}

function rowObject(headers: string[], cells: string[]): Record<string, string> {
  return Object.fromEntries(headers.map((header, index) => [header, cells[index]?.trim() ?? ""]));
}

function parseRow(kind: RecordKind, row: Record<string, string>, line: number): ArchitectureRecord {
  if (kind === "requirement") {
    return {
      kind,
      id: row.id ?? "",
      line,
      statement: row.requirement ?? "",
      source: row.source ?? "",
      owner: row.owner ?? "",
      verification: row.verification ?? "",
      status: (row.status ?? "") as RequirementStatus,
    };
  }
  if (kind === "assumption") {
    return {
      kind,
      id: row.id ?? "",
      line,
      statement: row.assumption ?? "",
      evidenceNeeded: row["evidence needed"] ?? "",
      owner: row.owner ?? "",
      reviewTrigger: row["review trigger"] ?? "",
      status: (row.status ?? "") as AssumptionStatus,
    };
  }
  if (kind === "decision") {
    return {
      kind,
      id: row.id ?? "",
      line,
      decision: row.decision ?? "",
      rationale: row.rationale ?? "",
      consequences: row.consequences ?? "",
      status: (row.status ?? "") as DecisionStatus,
      owner: row.owner ?? "",
      approvedBy: row["approved by"] ?? "",
    };
  }
  if (kind === "risk") {
    return {
      kind,
      id: row.id ?? "",
      line,
      risk: row.risk ?? "",
      likelihood: row.likelihood ?? "",
      impact: row.impact ?? "",
      mitigation: row.mitigation ?? "",
      owner: row.owner ?? "",
      status: (row.status ?? "") as RiskStatus,
      approvedBy: row["approved by"] ?? "",
    };
  }
  return {
    kind,
    id: row.id ?? "",
    line,
    supports: (row.supports ?? "")
      .split(/[\s,;]+/)
      .map((value) => value.trim())
      .filter(Boolean),
    source: row.source ?? "",
    retrievedOn: row["retrieved on"] ?? "",
    notes: row.notes ?? "",
  };
}

function addRecord(records: ArchitectureRecords, record: ArchitectureRecord): void {
  if (record.kind === "requirement") records.requirements.push(record);
  if (record.kind === "assumption") records.assumptions.push(record);
  if (record.kind === "decision") records.decisions.push(record);
  if (record.kind === "risk") records.risks.push(record);
  if (record.kind === "evidence") records.evidence.push(record);
}

export function parseArchitectureRecords(parsed: ParsedArchitecture): {
  records: ArchitectureRecords;
  diagnostics: Diagnostic[];
} {
  const records = emptyRecords();
  const diagnostics: Diagnostic[] = [];

  for (const block of parsed.blocks) {
    if (block.kind !== "table" || block.rows.length === 0) continue;
    const headers = (block.rows[0] ?? []).map((cell) => normalizeHeader(inlineText(cell)));
    const kind = tableKind(headers);
    if (!kind) continue;
    const expected = EXPECTED_HEADERS[kind];
    const missing = expected.filter((header) => !headers.includes(header));
    if (missing.length > 0) {
      diagnostics.push({
        code: `record.${kind}.columns`,
        severity: "error",
        message: `${kind} record table is missing columns: ${missing.join(", ")}.`,
        line: block.line,
        remediation: `Use the columns: ${expected.join(" | ")}.`,
      });
      continue;
    }
    for (const [index, cells] of block.rows.slice(1).entries()) {
      const values = cells.map((cell) => inlineText(cell));
      if (values.every((value) => value.trim() === "")) continue;
      addRecord(records, parseRow(kind, rowObject(headers, values), block.line + index + 2));
    }
  }
  return { records, diagnostics };
}

function recordFields(record: ArchitectureRecord): [string, string][] {
  if (record.kind === "requirement") {
    return [
      ["requirement", record.statement],
      ["source", record.source],
      ["owner", record.owner],
      ["verification", record.verification],
    ];
  }
  if (record.kind === "assumption") {
    return [
      ["assumption", record.statement],
      ["evidence needed", record.evidenceNeeded],
      ["owner", record.owner],
      ["review trigger", record.reviewTrigger],
    ];
  }
  if (record.kind === "decision") {
    return [
      ["decision", record.decision],
      ["rationale", record.rationale],
      ["consequences", record.consequences],
      ["owner", record.owner],
    ];
  }
  if (record.kind === "risk") {
    return [
      ["risk", record.risk],
      ["likelihood", record.likelihood],
      ["impact", record.impact],
      ["mitigation", record.mitigation],
      ["owner", record.owner],
    ];
  }
  return [
    ["supports", record.supports.join(", ")],
    ["source", record.source],
    ["retrieved on", record.retrievedOn],
  ];
}

export function validateArchitectureRecords(records: ArchitectureRecords): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const all: ArchitectureRecord[] = [
    ...records.requirements,
    ...records.assumptions,
    ...records.decisions,
    ...records.risks,
    ...records.evidence,
  ];
  const seen = new Set<string>();

  for (const record of all) {
    if (!RECORD_PATTERNS[record.kind].test(record.id)) {
      diagnostics.push({
        code: `record.${record.kind}.id`,
        severity: "error",
        message: `Invalid ${record.kind} identifier: ${record.id || "(empty)"}.`,
        line: record.line,
        remediation: `Use ${RECORD_PREFIXES[record.kind]}-###.`,
      });
    }
    if (seen.has(record.id)) {
      diagnostics.push({
        code: "record.id.duplicate",
        severity: "error",
        message: `Duplicate architecture record identifier: ${record.id}.`,
        line: record.line,
        remediation: "Assign every architecture record a unique identifier.",
      });
    }
    seen.add(record.id);
    for (const [field, value] of recordFields(record)) {
      if (value.trim() !== "") continue;
      diagnostics.push({
        code: `record.${record.kind}.required-field`,
        severity: "error",
        message: `${record.id || record.kind} is missing required field '${field}'.`,
        line: record.line,
        remediation: `Provide a non-empty ${field} value.`,
      });
    }
    if (record.kind !== "evidence" && !STATUSES[record.kind].has(record.status as never)) {
      diagnostics.push({
        code: `record.${record.kind}.status`,
        severity: "error",
        message: `${record.id} has invalid status '${record.status}'.`,
        line: record.line,
        remediation: `Use one of: ${[...STATUSES[record.kind]].join(", ")}.`,
      });
    }
    if (
      (record.kind === "decision" || record.kind === "risk") &&
      record.status === "accepted" &&
      record.approvedBy.trim() === ""
    ) {
      diagnostics.push({
        code: `record.${record.kind}.approval-required`,
        severity: "error",
        message: `${record.id} is accepted without human approval attribution.`,
        line: record.line,
        remediation: "A human approver must set Approved By; an agent must not self-approve.",
      });
    }
  }

  const supportedIds = new Set(
    all.filter((record) => record.kind !== "evidence").map((record) => record.id),
  );
  for (const evidence of records.evidence) {
    for (const target of evidence.supports) {
      if (supportedIds.has(target)) continue;
      diagnostics.push({
        code: "record.evidence.dangling-reference",
        severity: "error",
        message: `${evidence.id} supports unknown record '${target}'.`,
        line: evidence.line,
        remediation: "Reference an existing REQ, ASM, ADR, or RSK identifier.",
      });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(evidence.retrievedOn)) {
      diagnostics.push({
        code: "record.evidence.retrieved-on",
        severity: "error",
        message: `${evidence.id} must use an ISO retrieval date (YYYY-MM-DD).`,
        line: evidence.line,
      });
    }
  }

  const evidenceTargets = new Set(records.evidence.flatMap((evidence) => evidence.supports));
  const evidenceRequired = all.filter(
    (record): record is Exclude<ArchitectureRecord, EvidenceRecord> => {
      if (record.kind === "requirement")
        return record.status === "accepted" || record.status === "verified";
      if (record.kind === "assumption") return record.status === "validated";
      if (record.kind === "decision") return record.status === "accepted";
      if (record.kind === "risk")
        return ["mitigated", "accepted", "closed"].includes(record.status);
      return false;
    },
  );
  for (const record of evidenceRequired) {
    if (evidenceTargets.has(record.id)) continue;
    diagnostics.push({
      code: "record.evidence.missing",
      severity: "error",
      message: `${record.id} has status '${record.status}' but no EVD record supports it.`,
      line: record.line,
      remediation: "Add a traceable evidence record or move the record back to a draft status.",
    });
  }
  return diagnostics;
}

export function architectureRecordList(records: ArchitectureRecords): ArchitectureRecord[] {
  return [
    ...records.requirements,
    ...records.assumptions,
    ...records.decisions,
    ...records.risks,
    ...records.evidence,
  ].sort((left, right) => left.id.localeCompare(right.id));
}

export function recordById(records: ArchitectureRecords): Map<string, ArchitectureRecord> {
  return new Map(architectureRecordList(records).map((record) => [record.id, record]));
}

export function approvalTransitions(
  previous: ArchitectureRecords,
  current: ArchitectureRecords,
): ApprovalTransition[] {
  const before = recordById(previous);
  const candidates: (DecisionRecord | RiskRecord)[] = [...current.decisions, ...current.risks];
  return candidates
    .filter((record) => record.status === "accepted")
    .filter((record) => {
      const earlier = before.get(record.id);
      return earlier?.kind !== record.kind || earlier.status !== "accepted";
    })
    .map((record) => {
      const earlier = before.get(record.id);
      const previousStatus = !earlier || earlier.kind === "evidence" ? undefined : earlier.status;
      return {
        id: record.id,
        kind: record.kind,
        ...(previousStatus ? { previousStatus } : {}),
        currentStatus: "accepted" as const,
        approvedBy: record.approvedBy,
      };
    })
    .sort((left, right) => left.id.localeCompare(right.id));
}

export function requirementStatuses(): readonly RequirementStatus[] {
  return [...STATUSES.requirement];
}

export function assumptionStatuses(): readonly AssumptionStatus[] {
  return [...STATUSES.assumption];
}
