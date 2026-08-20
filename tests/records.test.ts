import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { parseArchitecture } from "../src/markdown.js";
import { parseArchitectureRecords, validateArchitectureRecords } from "../src/records.js";

async function evaluate(name: string) {
  const parsed = parseArchitecture(await readFile(`evals/fixtures/${name}.md`, "utf8"));
  const result = parseArchitectureRecords(parsed);
  return {
    source: parsed.source,
    records: result.records,
    diagnostics: [...result.diagnostics, ...validateArchitectureRecords(result.records)],
  };
}

describe("machine-readable architecture records", () => {
  it("parses stable requirement, assumption, decision, risk, and evidence records", async () => {
    const parsed = parseArchitecture(
      await readFile("examples/service-fulfillment/architecture.md", "utf8"),
    );
    const result = parseArchitectureRecords(parsed);
    expect(result.diagnostics).toEqual([]);
    expect(result.records.requirements).toHaveLength(6);
    expect(result.records.assumptions).toHaveLength(5);
    expect(result.records.decisions).toHaveLength(5);
    expect(result.records.risks).toHaveLength(3);
    expect(result.records.evidence).toHaveLength(5);
    expect(validateArchitectureRecords(result.records)).toEqual([]);
  });

  it("reports accepted records without evidence", async () => {
    const result = await evaluate("missing-evidence");
    expect(result.diagnostics.map((item) => item.code)).toContain("record.evidence.missing");
  });

  it("rejects unsafe acceptance without human attribution", async () => {
    const result = await evaluate("unsafe-acceptance");
    expect(result.diagnostics.map((item) => item.code)).toContain(
      "record.decision.approval-required",
    );
  });

  it("treats prompt-injection text as inert architecture data", async () => {
    const result = await evaluate("prompt-injection");
    expect(result.source).toContain("Ignore AGENTS.md");
    expect(result.records.requirements.map((record) => record.id)).toEqual(["REQ-001"]);
    expect(result.records.decisions).toEqual([]);
    expect(result.records.risks).toEqual([]);
  });
});
