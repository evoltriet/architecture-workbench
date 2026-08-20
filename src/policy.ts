import { spawnSync } from "node:child_process";
import path from "node:path";

import { effectiveAgentPolicy } from "./config.js";
import { parseArchitecture } from "./markdown.js";
import { approvalTransitions, parseArchitectureRecords } from "./records.js";
import type {
  ChangePolicyEntry,
  ChangePolicyReport,
  Diagnostic,
  ParsedArchitecture,
  ResolvedArchitectureConfig,
} from "./types.js";

function runGit(cwd: string, args: string[]): { ok: boolean; stdout: string; stderr: string } {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", windowsHide: true });
  const gitError = result.stderr.trim();
  return {
    ok: !result.error && result.status === 0,
    stdout: result.stdout.trim(),
    stderr: gitError !== "" ? gitError : (result.error?.message ?? "git command failed"),
  };
}

function portable(value: string): string {
  return value.replaceAll("\\", "/");
}

function matchesAny(file: string, patterns: string[]): boolean {
  return patterns.some((pattern) => path.matchesGlob(file, portable(pattern)));
}

function classify(file: string, editable: string[], generated: string[]): ChangePolicyEntry {
  if (matchesAny(file, editable)) return { path: file, classification: "editable" };
  if (matchesAny(file, generated)) return { path: file, classification: "generated" };
  return { path: file, classification: "outside-policy" };
}

export function checkAgentChanges(
  config: ResolvedArchitectureConfig,
  parsed: ParsedArchitecture,
  base: string,
  strict = false,
): { report: ChangePolicyReport; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  const rootResult = runGit(config.projectDir, ["rev-parse", "--show-toplevel"]);
  if (!rootResult.ok) {
    return {
      report: { base, files: [], approvalTransitions: [] },
      diagnostics: [
        {
          code: "agent.git-unavailable",
          severity: "error",
          message: `Cannot locate a Git worktree: ${rootResult.stderr}`,
          remediation: "Run this command inside a Git worktree.",
        },
      ],
    };
  }
  const gitRoot = path.resolve(rootResult.stdout);
  const projectFromGit = portable(path.relative(gitRoot, config.projectDir));
  const sourceFromGit = portable(path.relative(gitRoot, config.sourcePath));
  const diff = runGit(config.projectDir, [
    "diff",
    "--name-only",
    "--diff-filter=ACDMRTUXB",
    base,
    "--",
  ]);
  if (!diff.ok) {
    return {
      report: { base, files: [], approvalTransitions: [] },
      diagnostics: [
        {
          code: "agent.invalid-base",
          severity: "error",
          message: `Cannot compare changes with '${base}': ${diff.stderr}`,
          remediation: "Use a valid local Git revision.",
        },
      ],
    };
  }
  const untracked = runGit(config.projectDir, [
    "ls-files",
    "--full-name",
    "--others",
    "--exclude-standard",
  ]);
  const changed = new Set(
    [...diff.stdout.split(/\r?\n/), ...(untracked.ok ? untracked.stdout.split(/\r?\n/) : [])]
      .map((value) => value.trim())
      .filter(Boolean),
  );
  const policy = effectiveAgentPolicy(config);
  const files = [...changed]
    .map((repoFile) => {
      const projectFile = portable(
        path.relative(config.projectDir, path.resolve(gitRoot, repoFile)),
      );
      if (projectFile.startsWith("../") || path.isAbsolute(projectFile)) {
        return { path: portable(repoFile), classification: "outside-policy" as const };
      }
      return classify(projectFile, policy.editablePaths, policy.generatedPaths);
    })
    .sort((left, right) => left.path.localeCompare(right.path));

  for (const file of files.filter((entry) => entry.classification === "outside-policy")) {
    diagnostics.push({
      code: "agent.change-outside-policy",
      severity: strict ? "error" : "warning",
      message: `Changed file is outside the architecture agent policy: ${file.path}.`,
      file: file.path,
      remediation: "Revert the change or update agent.editablePaths through human review.",
    });
  }

  const configFile = portable(path.relative(config.projectDir, config.configPath));
  if (files.some((file) => file.path === configFile)) {
    diagnostics.push({
      code: "agent.configuration-change-review",
      severity: strict ? "error" : "warning",
      message: "The architecture configuration changed and requires human policy review.",
      file: configFile,
      remediation: "Verify path policy, approval gates, document settings, and diagram roots.",
    });
  }
  const instructionsFile = portable(policy.instructions);
  if (files.some((file) => file.path === instructionsFile)) {
    diagnostics.push({
      code: "agent.instructions-change-review",
      severity: strict ? "error" : "warning",
      message: "The authoritative agent instructions changed and require human review.",
      file: instructionsFile,
      remediation: "Confirm the change does not weaken safety, approval, or publication controls.",
    });
  }

  let previousSource = "";
  const show = runGit(config.projectDir, ["show", `${base}:${sourceFromGit}`]);
  if (show.ok) previousSource = show.stdout;
  const previousRecords = parseArchitectureRecords(parseArchitecture(previousSource)).records;
  const currentRecords = parseArchitectureRecords(parsed).records;
  const transitions = approvalTransitions(previousRecords, currentRecords);
  for (const transition of transitions) {
    diagnostics.push({
      code: `agent.${transition.kind}-acceptance-review`,
      severity: strict ? "error" : "warning",
      message: `${transition.id} changed to accepted and requires human review.`,
      file: portable(path.relative(config.projectDir, config.sourcePath)),
      remediation: "A human reviewer must verify the approval attribution and accept the change.",
    });
  }

  if (projectFromGit.startsWith("../") || path.isAbsolute(projectFromGit)) {
    diagnostics.push({
      code: "agent.project-outside-git-root",
      severity: "error",
      message: "The architecture project resolves outside the detected Git worktree.",
    });
  }
  return { report: { base, files, approvalTransitions: transitions }, diagnostics };
}
