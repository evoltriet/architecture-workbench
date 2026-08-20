import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";

type Envelope = {
  schemaVersion: number;
  command: string;
  ok: boolean;
  project: { root: string; config: string };
  data: unknown;
  diagnostics: unknown[];
};

const config = "examples/service-fulfillment/architecture.yaml";
const commands: { command: string; args: string[] }[] = [
  { command: "context", args: ["context", "--config", config, "--format", "json"] },
  { command: "status", args: ["status", "--config", config, "--format", "json"] },
  {
    command: "validate",
    args: ["validate", "--config", config, "--strict", "--format", "json"],
  },
  { command: "review", args: ["review", "--config", config, "--format", "json"] },
  { command: "build", args: ["build", "--config", config, "--format", "json"] },
  { command: "prompts.list", args: ["prompts", "list", "--format", "json"] },
  { command: "prompts.show", args: ["prompts", "show", "discover", "--format", "json"] },
  {
    command: "agent.check-changes",
    args: ["agent", "check-changes", "--base", "HEAD", "--config", config, "--format", "json"],
  },
  {
    command: "diagrams.inspect",
    args: ["diagrams", "inspect", "--config", config, "--format", "json"],
  },
  {
    command: "diagrams.verify",
    args: ["diagrams", "verify", "--config", config, "--format", "json"],
  },
];

function execute(args: string[], expectedStatus = 0): { envelope: Envelope; output: string } {
  const result = spawnSync(process.execPath, [path.resolve("dist/cli.js"), ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    windowsHide: true,
  });
  assert.equal(result.status, expectedStatus, result.stderr || result.stdout);
  const envelope = JSON.parse(result.stdout) as Envelope;
  return { envelope, output: result.stdout };
}

const exportFailure = execute(
  [
    "diagrams",
    "export",
    "--config",
    config,
    "--drawio-bin",
    "definitely-missing-drawio-binary",
    "--format",
    "json",
  ],
  3,
);
assert.equal(exportFailure.envelope.command, "diagrams.export");
assert.equal(exportFailure.envelope.ok, false);
assert(
  !exportFailure.output.includes(process.cwd()),
  "Diagram export error leaked an absolute path.",
);

for (const contract of commands) {
  const { envelope, output } = execute(contract.args);
  assert.equal(envelope.schemaVersion, 1);
  assert.equal(envelope.command, contract.command);
  assert.equal(typeof envelope.ok, "boolean");
  assert.deepEqual(envelope.project.root, ".");
  assert(Array.isArray(envelope.diagnostics));
  assert(!output.includes(process.cwd()), `${contract.command} leaked an absolute project path.`);
}

const contextCommand = commands.at(0);
assert(contextCommand);
const first = execute(contextCommand.args).output;
const second = execute(contextCommand.args).output;
assert.equal(first, second, "Context JSON must be deterministic across identical calls.");
process.stdout.write(`CLI JSON contracts verified (${commands.length + 1} commands).\n`);
