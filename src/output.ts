import type { Diagnostic, ReviewReport } from "./types.js";

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
