import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { ConfigurationError, loadConfig } from "../src/config.js";

const root = path.resolve("outputs/test-paths");

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("project path confinement", () => {
  it("rejects configured paths that traverse outside the project", async () => {
    await mkdir(root, { recursive: true });
    await writeFile(
      path.join(root, "architecture.yaml"),
      `schemaVersion: 1
document:
  title: Escape
  author: Test
  source: ../outside.md
  output: dist/test.docx
`,
    );
    await expect(loadConfig(path.join(root, "architecture.yaml"))).rejects.toBeInstanceOf(
      ConfigurationError,
    );
  });

  it("rejects escaping agent path patterns", async () => {
    await mkdir(root, { recursive: true });
    await writeFile(path.join(root, "architecture.md"), "# Test\n");
    await writeFile(
      path.join(root, "architecture.yaml"),
      `schemaVersion: 1
document:
  title: Escape
  author: Test
  source: architecture.md
  output: dist/test.docx
agent:
  instructions: AGENTS.md
  editablePaths:
    - ../**/*
`,
    );
    await expect(loadConfig(path.join(root, "architecture.yaml"))).rejects.toBeInstanceOf(
      ConfigurationError,
    );
  });
});
