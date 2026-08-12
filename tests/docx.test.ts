import { readFile, rm } from "node:fs/promises";

import JSZip from "jszip";
import { afterEach, describe, expect, it } from "vitest";

import { loadConfig } from "../src/config.js";
import { createDocx, writeDocx } from "../src/docx.js";
import { parseArchitecture } from "../src/markdown.js";
import { validateDocx } from "../src/validation.js";

afterEach(async () => {
  await rm("examples/service-fulfillment/dist", { recursive: true, force: true });
});

describe("DOCX generation", () => {
  it("builds a valid package with unique bookmarks and native constructs", async () => {
    const config = await loadConfig("examples/service-fulfillment/architecture.yaml");
    const parsed = parseArchitecture(await readFile(config.sourcePath, "utf8"));
    const buffer = await createDocx(parsed, config);
    const zip = await JSZip.loadAsync(buffer, { checkCRC32: true });
    const documentPart = zip.file("word/document.xml");
    expect(documentPart).not.toBeNull();
    if (!documentPart) throw new Error("Generated DOCX is missing word/document.xml");
    const xml = await documentPart.async("string");
    const starts = [...xml.matchAll(/<w:bookmarkStart\b[^>]*w:id="([^"]+)"/g)].map(
      (match) => match[1],
    );

    expect(new Set(starts).size).toBe(starts.length);
    expect(xml).toContain('w:pStyle w:val="Heading2"');
    expect(xml).toContain("<w:tbl");
    expect(xml).toContain("<w:hyperlink");
    expect(
      Object.keys(zip.files).filter(
        (name) => name.startsWith("word/media/") && name.endsWith(".png"),
      ),
    ).toHaveLength(8);

    const output = await writeDocx(parsed, config);
    expect(await validateDocx(output, config)).toEqual([]);
  });
});
