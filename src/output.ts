import path from "node:path";

import type {
  ArchitectureContext,
  ArchitectureStatus,
  CommandEnvelope,
  Diagnostic,
  ResolvedArchitectureConfig,
  ReviewReport,
} from "./types.js";

export function formatDiagnostics(diagnostics: Diagnostic[], format: "text" | "json"): string {
  if (format === "json") return JSON.stringify({ diagnostics }, null, 2);
  if (diagnostics.length === 0) return "No validation issues found.";
  return diagnostics
    .map((diagnostic) => {
      const location = diagnostic.file
        ? ` ${diagnostic.file}${diagnostic.line ? `:${diagnostic.line}` : ""}`
        : "";
      const remediation = diagnostic.remediation ? `\n  Fix: ${diagnostic.remediation}` : "";
      return `${diagnostic.severity.toUpperCase()} ${diagnostic.code}${location}\n  ${diagnostic.message}${remediation}`;
    })
    .join("\n\n");
}

export function formatReview(report: ReviewReport, format: "text" | "json"): string {
  if (format === "json") return JSON.stringify(report, null, 2);
  const lines = [
    `Architecture coverage: ${report.score}/${report.maxScore} (${report.percentage}%)`,
  ];
  for (const dimension of report.dimensions) {
    lines.push(`\n${dimension.name}: ${dimension.score}/${dimension.maxScore}`);
    if (dimension.evidence.length > 0) lines.push(`  Evidence: ${dimension.evidence.join("; ")}`);
    if (dimension.recommendation) lines.push(`  Next: ${dimension.recommendation}`);
  }
  return lines.join("\n");
}

export function hasErrors(diagnostics: Diagnostic[]): boolean {
  return diagnostics.some((diagnostic) => diagnostic.severity === "error");
}

export function createEnvelope<T>(
  command: string,
  config: ResolvedArchitectureConfig,
  data: T,
  diagnostics: Diagnostic[],
): CommandEnvelope<T> {
  return {
    schemaVersion: 1,
    command,
    ok: !hasErrors(diagnostics),
    project: {
      root: ".",
      config: path.relative(config.projectDir, config.configPath).replaceAll("\\", "/") || ".",
    },
    data,
    diagnostics,
  };
}

export function createStandaloneEnvelope<T>(
  command: string,
  data: T,
  diagnostics: Diagnostic[] = [],
): CommandEnvelope<T> {
  return {
    schemaVersion: 1,
    command,
    ok: !hasErrors(diagnostics),
    project: { root: ".", config: "." },
    data,
    diagnostics,
  };
}

export function formatEnvelope<T>(envelope: CommandEnvelope<T>): string {
  return JSON.stringify(envelope, null, 2);
}

export function formatContext(context: ArchitectureContext): string {
  const recordCount =
    context.records.requirements.length +
    context.records.assumptions.length +
    context.records.decisions.length +
    context.records.risks.length +
    context.records.evidence.length;
  return [
    context.metadata.title,
    `Source: ${context.paths.source}`,
    `Outline: ${context.outline.length} headings`,
    `Records: ${recordCount}`,
    `Diagrams: ${context.diagrams.length}`,
    `Coverage: ${context.review.percentage}%`,
    `Agent instructions: ${context.policy.instructions}`,
  ].join("\n");
}

export function formatStatus(status: ArchitectureStatus): string {
  const lines = status.phases.map(
    (phase) =>
      `${phase.ready ? "READY" : "BLOCKED"} ${phase.name}${phase.blockers.length ? `: ${phase.blockers.join("; ")}` : ""}`,
  );
  lines.push(`\nPublishable: ${status.readyToPublish ? "yes" : "no"}`);
  if (status.nextActions.length > 0) {
    lines.push("\nNext actions:");
    lines.push(...status.nextActions.map((action) => `- ${action}`));
  }
  return lines.join("\n");
}
