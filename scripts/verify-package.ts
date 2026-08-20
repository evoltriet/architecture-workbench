import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const pnpmEntry = process.env.npm_execpath;
const command = pnpmEntry ? process.execPath : process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const args = pnpmEntry
  ? [pnpmEntry, "pack", "--dry-run", "--json"]
  : ["pack", "--dry-run", "--json"];
const result = spawnSync(command, args, {
  cwd: process.cwd(),
  encoding: "utf8",
  windowsHide: true,
  env: { ...process.env, CI: "true" },
});

if (result.status !== 0) {
  throw new Error(result.stderr || result.stdout || "pnpm pack --dry-run failed");
}

const parsed = JSON.parse(result.stdout) as
  { files?: { path: string }[] } | { files?: { path: string }[] }[];
const manifest = Array.isArray(parsed) ? parsed[0] : parsed;
const files = (manifest?.files ?? []).map((file) => file.path.replaceAll("\\", "/"));

for (const expected of [
  "AGENTS.md",
  "CLAUDE.md",
  "dist/cli.js",
  "templates/service/AGENTS.md",
  "templates/service/architecture.md",
  "prompts/discovery-interview.md",
  "integrations/codex.toml",
]) {
  assert(files.includes(expected), `Package is missing ${expected}.`);
}
assert(!files.some((file) => file.endsWith(".docx")), "Generated DOCX files must not be packaged.");
process.stdout.write(`Package contents verified (${files.length} files).\n`);
