import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";

import {
  embedDiagramMetadata,
  inspectDiagrams,
  readDiagramMetadata,
  sourceHash,
  verifyDiagrams,
} from "../src/diagrams.js";
import { loadConfig } from "../src/config.js";

const root = path.resolve("outputs/test-diagrams");

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function fixture() {
  const sourceDir = path.join(root, "diagrams");
  const renderedDir = path.join(sourceDir, "rendered");
  await mkdir(renderedDir, { recursive: true });
  const drawioPath = path.join(sourceDir, "context.drawio");
  const pngPath = path.join(renderedDir, "context.png");
  const mxfile =
    '<mxfile><diagram id="context" name="Context"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="service" value="Service" vertex="1" parent="1"><mxGeometry x="10" y="10" width="100" height="50" as="geometry"/></mxCell></root></mxGraphModel></diagram></mxfile>';
  await writeFile(drawioPath, mxfile);
  await sharp({ create: { width: 20, height: 20, channels: 4, background: "white" } })
    .png()
    .toFile(pngPath);
  await embedDiagramMetadata(pngPath, drawioPath);
  const configPath = path.join(root, "architecture.yaml");
  await writeFile(
    configPath,
    `schemaVersion: 1
document:
  title: Test
  author: Test
  source: architecture.md
  output: dist/test.docx
diagrams:
  sourceDir: diagrams
  renderedDir: diagrams/rendered
quality:
  profile: service
  requiredSections: []
`,
  );
  await writeFile(path.join(root, "architecture.md"), "# Test\n");
  return { drawioPath, pngPath, mxfile, config: await loadConfig(configPath) };
}

describe("diagram metadata", () => {
  it("embeds the editable source and verifies its content hash", async () => {
    const { pngPath, mxfile, config } = await fixture();
    const metadata = readDiagramMetadata(await readFile(pngPath));
    expect(metadata.mxfile).toBe(mxfile);
    expect(metadata.sourceHash).toBe(sourceHash(mxfile));
    expect(await verifyDiagrams(config)).toEqual([]);
  });

  it("detects a stale preview", async () => {
    const { drawioPath, config } = await fixture();
    await writeFile(drawioPath, '<mxfile><diagram name="Changed"/></mxfile>');
    expect((await verifyDiagrams(config)).map((item) => item.code)).toContain(
      "diagram.stale-preview",
    );
  });

  it("rejects active-content labels", async () => {
    const { drawioPath, pngPath, config } = await fixture();
    await writeFile(
      drawioPath,
      '<mxfile><diagram id="context" name="Context"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="service" value="javascript:alert(1)" vertex="1" parent="1"/></root></mxGraphModel></diagram></mxfile>',
    );
    await embedDiagramMetadata(pngPath, drawioPath);
    const result = await inspectDiagrams(config);
    expect(result.diagnostics.map((item) => item.code)).toContain("diagram.invalid-label");
  });

  it("inspects draw.io object-wrapped cells", async () => {
    const { drawioPath, pngPath, config } = await fixture();
    await writeFile(
      drawioPath,
      '<mxfile><diagram id="context" name="Context"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><object id="service" label="Wrapped Service"><mxCell vertex="1" parent="1"/></object></root></mxGraphModel></diagram></mxfile>',
    );
    await embedDiagramMetadata(pngPath, drawioPath);
    const result = await inspectDiagrams(config);
    expect(result.diagnostics).toEqual([]);
    expect(result.diagrams[0]?.nodes).toContainEqual(
      expect.objectContaining({ id: "service", label: "Wrapped Service" }),
    );
  });
});
