import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const textExtensions = new Set([
  ".cjs",
  ".js",
  ".json",
  ".md",
  ".mjs",
  ".ts",
  ".txt",
  ".yaml",
  ".yml",
]);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function textFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (new Set([".git", "node_modules", "dist", "outputs", "coverage"]).has(entry.name)) continue;
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...(await textFiles(fullPath)));
    if (entry.isFile() && textExtensions.has(path.extname(entry.name).toLowerCase()))
      files.push(fullPath);
  }
  return files;
}

describe("open-source sanitization", () => {
  it("contains no source-project identifiers or user-specific path fragments", async () => {
    const banned = [
      ["M", "A", "A", "R", "S"].join(""),
      ["P", "H", "I"].join(""),
      ["B", "e", "d", "r", "o", "c", "k"].join(""),
      ["h", "o", "s", "p", "i", "t", "a", "l"].join(""),
      ["t", "r", "i", "c", "k"].join(""),
      ["A", "I", " ", "W", "o", "r", "k", "s", "p", "a", "c", "e"].join(""),
    ];
    const violations: string[] = [];
    for (const file of await textFiles(".")) {
      const content = await readFile(file, "utf8");
      for (const term of banned) {
        const sourceIdentifier = new RegExp(
          `(?:^|[^A-Za-z0-9])${escapeRegExp(term)}(?:$|[^A-Za-z0-9])`,
          "i",
        );
        if (sourceIdentifier.test(content)) {
          violations.push(`${file}: ${term}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
