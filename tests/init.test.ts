import { readFile, rm } from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { loadConfig } from "../src/config.js";
import { parseArchitecture } from "../src/markdown.js";
import { initializeProject } from "../src/project.js";
import { validateProject } from "../src/validation.js";

const target = path.resolve("outputs/test-init");

afterEach(async () => {
  await rm(target, { recursive: true, force: true });
});

describe("project initialization", () => {
  it("creates a portable, strictly valid service project", async () => {
    await initializeProject(target, "service");
    const config = await loadConfig(path.join(target, "architecture.yaml"));
    const parsed = parseArchitecture(await readFile(config.sourcePath, "utf8"));
    expect(config.projectDir).toBe(target);
    expect(await validateProject(parsed, config, true)).toEqual([]);
  });
});
