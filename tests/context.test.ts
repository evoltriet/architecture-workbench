import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { loadConfig } from "../src/config.js";
import { createArchitectureContext, createArchitectureStatus } from "../src/context.js";
import { writeDocx } from "../src/docx.js";
import { parseArchitecture } from "../src/markdown.js";
import { initializeProject } from "../src/project.js";
import { loadArchitectureContext, loadArchitectureStatus } from "../src/runtime.js";
import { validateDocx, validateProject } from "../src/validation.js";

const legacyTarget = path.resolve("outputs/test-v01-project");

afterEach(async () => {
  await rm(legacyTarget, { recursive: true, force: true });
});

describe("agent context and lifecycle", () => {
  it("returns deterministic relative-path context and a publishable reference status", async () => {
    const configFile = "examples/service-fulfillment/architecture.yaml";
    const first = await loadArchitectureContext(configFile, true);
    const second = await loadArchitectureContext(configFile, true);
    expect(first.context).toEqual(second.context);
    expect(JSON.stringify(first.context)).not.toContain(process.cwd());

    const status = await loadArchitectureStatus(configFile);
    expect(status.status.readyToPublish).toBe(true);
    expect(status.status.phases.every((phase) => phase.ready)).toBe(true);
  });

  it("keeps later lifecycle phases blocked when discovery is incomplete", async () => {
    const config = await loadConfig("examples/service-fulfillment/architecture.yaml");
    const parsed = parseArchitecture(
      await readFile("evals/fixtures/incomplete-discovery.md", "utf8"),
    );
    const result = await createArchitectureContext(parsed, config, false);
    const strictDiagnostics = await validateProject(parsed, config, true);
    const status = createArchitectureStatus(
      parsed,
      result.context,
      result.diagnostics,
      strictDiagnostics,
    );
    expect(status.phases.find((phase) => phase.name === "discover")?.ready).toBe(false);
    expect(status.phases.find((phase) => phase.name === "publish")?.ready).toBe(false);
    expect(status.readyToPublish).toBe(false);
  });

  it("builds a 0.1-style project without the optional agent configuration", async () => {
    await initializeProject(legacyTarget, "service");
    const configPath = path.join(legacyTarget, "architecture.yaml");
    const current = await readFile(configPath, "utf8");
    const legacy = current.replace(/\nagent:\n(?:[ ]{2}.*\n|\n)*?(?=quality:)/, "\n");
    await writeFile(configPath, legacy);
    await rm(path.join(legacyTarget, "AGENTS.md"));
    await rm(path.join(legacyTarget, "CLAUDE.md"));

    const config = await loadConfig(configPath);
    const parsed = parseArchitecture(await readFile(config.sourcePath, "utf8"));
    expect(config.agent).toBeUndefined();
    expect(await validateProject(parsed, config, true)).toEqual([]);
    const output = await writeDocx(parsed, config);
    expect(await validateDocx(output, config)).toEqual([]);
  });
});
