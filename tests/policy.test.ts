import { spawnSync } from "node:child_process";
import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { loadConfig } from "../src/config.js";
import { parseArchitecture } from "../src/markdown.js";
import { checkAgentChanges } from "../src/policy.js";
import { initializeProject } from "../src/project.js";

const root = path.resolve("outputs/test-change-policy");

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function git(...args: string[]): void {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw new Error(result.stderr || `git ${args.join(" ")} failed`);
}

describe("agent change policy", () => {
  it("reports prohibited paths and approval-sensitive transitions", async () => {
    await initializeProject(root, "service");
    git("init");
    git("config", "user.name", "Architecture Test");
    git("config", "user.email", "architecture-test@example.invalid");
    git("add", "architecture.yaml", "architecture.md", "AGENTS.md", "CLAUDE.md", "diagrams");
    git("commit", "-m", "baseline");

    const config = await loadConfig(path.join(root, "architecture.yaml"));
    const source = await readFile(config.sourcePath, "utf8");
    const accepted = source.replace(
      "| proposed | API owner          | Pending human approval |",
      "| accepted | API owner          | Human Reviewer         |",
    );
    await writeFile(config.sourcePath, accepted);
    await writeFile(path.join(root, "AGENTS.md"), "# Changed agent instructions\n");
    await writeFile(path.join(root, "notes.txt"), "outside agent policy\n");

    const result = checkAgentChanges(config, parseArchitecture(accepted), "HEAD", true);
    const codes = result.diagnostics.map((diagnostic) => diagnostic.code);
    expect(codes).toContain("agent.change-outside-policy");
    expect(codes).toContain("agent.decision-acceptance-review");
    expect(codes).toContain("agent.instructions-change-review");
    expect(result.report.approvalTransitions.map((transition) => transition.id)).toEqual([
      "ADR-001",
    ]);
  });
});
