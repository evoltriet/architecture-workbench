import { createHash } from "node:crypto";
import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { deflateSync, inflateSync } from "node:zlib";

import { XMLParser } from "fast-xml-parser";

import type {
  Diagnostic,
  DiagramEdge,
  DiagramInspection,
  DiagramMetadata,
  DiagramNode,
  ResolvedArchitectureConfig,
} from "./types.js";

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const MXFILE_KEYWORD = "mxfile";
const HASH_KEYWORD = "archwork-source-sha256";

type PngChunk = {
  type: string;
  data: Buffer;
};

let crcTable: Uint32Array | undefined;

function getCrcTable(): Uint32Array {
  if (crcTable) return crcTable;
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  crcTable = table;
  return table;
}

function crc32(buffer: Buffer): number {
  const table = getCrcTable();
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = (table[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function encodeChunk(chunk: PngChunk): Buffer {
  const type = Buffer.from(chunk.type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(chunk.data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([type, chunk.data])));
  return Buffer.concat([length, type, chunk.data, checksum]);
}

function parseChunks(png: Buffer): PngChunk[] {
  if (png.length < 8 || !png.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error("File does not have a valid PNG signature");
  }

  const chunks: PngChunk[] = [];
  let offset = 8;
  while (offset + 12 <= png.length) {
    const length = png.readUInt32BE(offset);
    const dataEnd = offset + 8 + length;
    const chunkEnd = dataEnd + 4;
    if (chunkEnd > png.length) throw new Error("PNG chunk extends beyond the file boundary");
    const type = png.subarray(offset + 4, offset + 8).toString("ascii");
    const data = png.subarray(offset + 8, dataEnd);
    const expectedCrc = png.readUInt32BE(dataEnd);
    const actualCrc = crc32(Buffer.concat([Buffer.from(type, "ascii"), data]));
    if (expectedCrc !== actualCrc) throw new Error(`PNG chunk ${type} has an invalid checksum`);
    chunks.push({ type, data });
    offset = chunkEnd;
    if (type === "IEND") break;
  }

  if (chunks.at(-1)?.type !== "IEND") throw new Error("PNG is missing the IEND chunk");
  return chunks;
}

function textKeyword(chunk: PngChunk): string | undefined {
  if (!new Set(["tEXt", "zTXt", "iTXt"]).has(chunk.type)) return undefined;
  const terminator = chunk.data.indexOf(0);
  if (terminator < 0) return undefined;
  return chunk.data.subarray(0, terminator).toString("latin1");
}

function textChunk(keyword: string, value: string): PngChunk {
  return {
    type: "tEXt",
    data: Buffer.concat([
      Buffer.from(keyword, "latin1"),
      Buffer.from([0]),
      Buffer.from(value, "utf8"),
    ]),
  };
}

function compressedTextChunk(keyword: string, value: string): PngChunk {
  return {
    type: "zTXt",
    data: Buffer.concat([
      Buffer.from(keyword, "latin1"),
      Buffer.from([0, 0]),
      deflateSync(Buffer.from(value, "utf8"), { level: 9 }),
    ]),
  };
}

export function sourceHash(source: Buffer | string): string {
  return createHash("sha256").update(source).digest("hex");
}

export async function embedDiagramMetadata(
  pngPath: string,
  drawioPath: string,
): Promise<DiagramMetadata> {
  const [png, drawio] = await Promise.all([readFile(pngPath), readFile(drawioPath)]);
  const mxfile = drawio.toString("utf8");
  const hash = sourceHash(drawio);
  const chunks = parseChunks(png).filter((chunk) => {
    const keyword = textKeyword(chunk);
    return keyword !== MXFILE_KEYWORD && keyword !== HASH_KEYWORD;
  });

  const output: Buffer[] = [PNG_SIGNATURE];
  for (const chunk of chunks) {
    if (chunk.type === "IEND") {
      output.push(encodeChunk(compressedTextChunk(MXFILE_KEYWORD, mxfile)));
      output.push(encodeChunk(textChunk(HASH_KEYWORD, hash)));
    }
    output.push(encodeChunk(chunk));
  }
  await writeFile(pngPath, Buffer.concat(output));
  return { sourceHash: hash, mxfile };
}

export function readDiagramMetadata(png: Buffer): DiagramMetadata {
  const metadata: DiagramMetadata = {};
  for (const chunk of parseChunks(png)) {
    const keyword = textKeyword(chunk);
    if (!keyword) continue;
    const terminator = chunk.data.indexOf(0);
    if (keyword === HASH_KEYWORD && chunk.type === "tEXt") {
      metadata.sourceHash = chunk.data.subarray(terminator + 1).toString("utf8");
    }
    if (keyword === MXFILE_KEYWORD && chunk.type === "zTXt") {
      const compressionMethod = chunk.data[terminator + 1];
      if (compressionMethod !== 0) throw new Error("Unsupported PNG text compression method");
      metadata.mxfile = inflateSync(chunk.data.subarray(terminator + 2)).toString("utf8");
    }
  }
  return metadata;
}

async function collectFiles(root: string, extension: string): Promise<string[]> {
  const results: string[] = [];
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) results.push(...(await collectFiles(fullPath, extension)));
    if (entry.isFile() && path.extname(entry.name).toLowerCase() === extension) {
      results.push(fullPath);
    }
  }
  return results.sort();
}

export function canonicalizeDrawioXml(source: string): string {
  const tokens = source.trim().replace(/>\s*</g, ">\n<").split("\n");
  const output: string[] = [];
  let depth = 0;
  for (const raw of tokens) {
    const token = raw.trim();
    if (token.startsWith("</")) depth = Math.max(0, depth - 1);
    output.push(`${"  ".repeat(depth)}${token}`);
    const opens =
      token.startsWith("<") &&
      !token.startsWith("</") &&
      !token.startsWith("<?") &&
      !token.startsWith("<!") &&
      !token.endsWith("/>") &&
      !/<\/[^>]+>$/.test(token);
    if (opens) depth += 1;
  }
  return `${output.join("\n")}\n`;
}

function xmlObject(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function isXmlObject(value: Record<string, unknown> | undefined): value is Record<string, unknown> {
  return value !== undefined;
}

function xmlArray(value: unknown): unknown[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function graphCells(root: Record<string, unknown>): Record<string, unknown>[] {
  const direct = xmlArray(root.mxCell).map(xmlObject).filter(isXmlObject);
  const wrapped = [...xmlArray(root.object), ...xmlArray(root.UserObject)]
    .map(xmlObject)
    .filter(isXmlObject)
    .map((wrapper): Record<string, unknown> | undefined => {
      const cell = xmlObject(wrapper.mxCell);
      if (!cell) return undefined;
      return {
        ...wrapper,
        ...cell,
        id: cell.id ?? wrapper.id,
        value: cell.value ?? wrapper.label ?? wrapper.value,
      };
    })
    .filter(isXmlObject);
  return [...direct, ...wrapped];
}

function xmlString(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return "";
}

function finiteNumber(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function readableLabel(value: unknown): string {
  return xmlString(value)
    .replace(/<br\s*\/?\s*>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function invalidLabelReason(value: unknown): string | undefined {
  const raw = xmlString(value);
  for (const character of raw) {
    const code = character.codePointAt(0) ?? 0;
    if (code < 32 && !new Set([9, 10, 13]).has(code)) return "contains control characters";
  }
  if (/<\/?(?:script|iframe|object)\b|javascript:/i.test(raw))
    return "contains executable or active-content markup";
  return undefined;
}

function parseDrawio(
  source: string,
  name: string,
  relativeSource: string,
): { diagram?: DiagramInspection; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "",
    allowBooleanAttributes: true,
    parseAttributeValue: false,
  });
  let document: Record<string, unknown> | undefined;
  try {
    document = xmlObject(parser.parse(source));
  } catch (error) {
    return {
      diagnostics: [
        {
          code: "diagram.invalid-xml",
          severity: "error",
          message: `Cannot parse draw.io XML: ${error instanceof Error ? error.message : String(error)}`,
          file: relativeSource,
        },
      ],
    };
  }
  const mxfile = xmlObject(document?.mxfile);
  if (!mxfile) {
    return {
      diagnostics: [
        {
          code: "diagram.missing-mxfile",
          severity: "error",
          message: "Draw.io source does not contain an mxfile root.",
          file: relativeSource,
        },
      ],
    };
  }
  const pages: DiagramInspection["pages"] = [];
  const nodes: DiagramNode[] = [];
  const edges: DiagramEdge[] = [];
  for (const [pageIndex, pageValue] of xmlArray(mxfile.diagram).entries()) {
    const page = xmlObject(pageValue);
    if (!page) continue;
    const pageId = xmlString(page.id) || `page-${pageIndex + 1}`;
    const pageName = xmlString(page.name) || pageId;
    pages.push({ id: pageId, name: pageName });
    const model = xmlObject(page.mxGraphModel);
    const root = xmlObject(model?.root);
    const cells = root ? graphCells(root) : [];
    if (!model || !root || cells.length === 0) {
      diagnostics.push({
        code: "diagram.malformed-page",
        severity: "error",
        message: `Page '${pageName}' has no usable mxGraphModel cells.`,
        file: relativeSource,
      });
      continue;
    }
    const ids = new Set<string>();
    for (const cell of cells) {
      const id = xmlString(cell.id);
      if (!id) {
        diagnostics.push({
          code: "diagram.cell-missing-id",
          severity: "error",
          message: `Page '${pageName}' contains a cell without an ID.`,
          file: relativeSource,
        });
        continue;
      }
      if (ids.has(id)) {
        diagnostics.push({
          code: "diagram.duplicate-cell-id",
          severity: "error",
          message: `Page '${pageName}' contains duplicate cell ID '${id}'.`,
          file: relativeSource,
        });
      }
      ids.add(id);
    }
    for (const cell of cells) {
      const id = xmlString(cell.id);
      if (!id) continue;
      if (xmlString(cell.vertex) === "1") {
        const geometry = xmlObject(cell.mxGeometry);
        const x = finiteNumber(geometry?.x);
        const y = finiteNumber(geometry?.y);
        const width = finiteNumber(geometry?.width);
        const height = finiteNumber(geometry?.height);
        const bounds = geometry
          ? {
              ...(x !== undefined ? { x } : {}),
              ...(y !== undefined ? { y } : {}),
              ...(width !== undefined ? { width } : {}),
              ...(height !== undefined ? { height } : {}),
            }
          : undefined;
        const label = readableLabel(cell.value);
        nodes.push({
          pageId,
          id,
          label,
          ...(xmlString(cell.parent) ? { parent: xmlString(cell.parent) } : {}),
          ...(bounds && Object.keys(bounds).length > 0 ? { bounds } : {}),
        });
        if (!label) {
          diagnostics.push({
            code: "diagram.node-empty-label",
            severity: "warning",
            message: `Vertex '${id}' on page '${pageName}' has an empty label.`,
            file: relativeSource,
          });
        }
        const invalidReason = invalidLabelReason(cell.value);
        if (invalidReason) {
          diagnostics.push({
            code: "diagram.invalid-label",
            severity: "error",
            message: `Vertex '${id}' on page '${pageName}' ${invalidReason}.`,
            file: relativeSource,
          });
        }
      }
      if (xmlString(cell.edge) === "1") {
        const sourceId = xmlString(cell.source);
        const targetId = xmlString(cell.target);
        edges.push({
          pageId,
          id,
          label: readableLabel(cell.value),
          ...(sourceId ? { source: sourceId } : {}),
          ...(targetId ? { target: targetId } : {}),
        });
        const invalidReason = invalidLabelReason(cell.value);
        if (invalidReason) {
          diagnostics.push({
            code: "diagram.invalid-label",
            severity: "error",
            message: `Edge '${id}' on page '${pageName}' ${invalidReason}.`,
            file: relativeSource,
          });
        }
        for (const [endpoint, endpointId] of [
          ["source", sourceId],
          ["target", targetId],
        ] as const) {
          if (!endpointId || ids.has(endpointId)) continue;
          diagnostics.push({
            code: "diagram.edge-invalid-endpoint",
            severity: "error",
            message: `Edge '${id}' references missing ${endpoint} '${endpointId}' on page '${pageName}'.`,
            file: relativeSource,
          });
        }
      }
    }
  }
  if (pages.length === 0) {
    diagnostics.push({
      code: "diagram.no-pages",
      severity: "error",
      message: "Draw.io source contains no diagram pages.",
      file: relativeSource,
    });
  }
  return { diagram: { name, source: relativeSource, pages, nodes, edges }, diagnostics };
}

export async function inspectDiagrams(config: ResolvedArchitectureConfig): Promise<{
  diagrams: DiagramInspection[];
  diagnostics: Diagnostic[];
}> {
  const diagrams: DiagramInspection[] = [];
  const diagnostics: Diagnostic[] = [];
  for (const source of await collectFiles(config.diagramSourcePath, ".drawio")) {
    const relativeSource = path.relative(config.projectDir, source).replaceAll("\\", "/");
    const name = path
      .relative(config.diagramSourcePath, source)
      .slice(0, -path.extname(source).length)
      .replaceAll("\\", "/");
    const result = parseDrawio(await readFile(source, "utf8"), name, relativeSource);
    if (result.diagram) diagrams.push(result.diagram);
    diagnostics.push(...result.diagnostics);
  }
  return {
    diagrams: diagrams.sort((left, right) => left.name.localeCompare(right.name)),
    diagnostics,
  };
}

export async function formatDrawioSources(config: ResolvedArchitectureConfig): Promise<string[]> {
  const formatted: string[] = [];
  for (const source of await collectFiles(config.diagramSourcePath, ".drawio")) {
    const canonical = canonicalizeDrawioXml(await readFile(source, "utf8"));
    await writeFile(source, canonical, "utf8");
    const relativeStem = path
      .relative(config.diagramSourcePath, source)
      .slice(0, -path.extname(source).length);
    const preview = path.join(config.diagramRenderedPath, `${relativeStem}.png`);
    try {
      await access(preview);
      await embedDiagramMetadata(preview, source);
    } catch {
      // A missing preview remains an actionable verify diagnostic.
    }
    formatted.push(source);
  }
  return formatted.sort();
}

export async function verifyDiagrams(config: ResolvedArchitectureConfig): Promise<Diagnostic[]> {
  const diagnostics: Diagnostic[] = [];
  const sources = await collectFiles(config.diagramSourcePath, ".drawio");
  const previews = await collectFiles(config.diagramRenderedPath, ".png");
  const sourceByRelativeStem = new Map(
    sources.map((file) => [
      path
        .relative(config.diagramSourcePath, file)
        .slice(0, -path.extname(file).length)
        .replaceAll("\\", "/"),
      file,
    ]),
  );
  const previewByRelativeStem = new Map(
    previews.map((file) => [
      path
        .relative(config.diagramRenderedPath, file)
        .slice(0, -path.extname(file).length)
        .replaceAll("\\", "/"),
      file,
    ]),
  );

  if (sources.length === 0) {
    diagnostics.push({
      code: "diagram.no-sources",
      severity: "warning",
      message: `No .drawio sources were found in ${config.diagrams.sourceDir}.`,
      file: config.diagrams.sourceDir,
      remediation: "Add editable draw.io sources or change diagrams.sourceDir.",
    });
  }

  for (const [stem, source] of sourceByRelativeStem) {
    const preview = previewByRelativeStem.get(stem);
    if (!preview) {
      diagnostics.push({
        code: "diagram.missing-preview",
        severity: "error",
        message: `Diagram ${stem}.drawio has no matching PNG preview.`,
        file: path.relative(config.projectDir, source),
        remediation: "Run archwork diagrams export or add the matching rendered PNG.",
      });
      continue;
    }

    try {
      const [drawio, png] = await Promise.all([readFile(source), readFile(preview)]);
      const metadata = readDiagramMetadata(png);
      const expectedHash = sourceHash(drawio);
      if (!metadata.sourceHash || !metadata.mxfile) {
        diagnostics.push({
          code: "diagram.missing-metadata",
          severity: "error",
          message: `Preview ${stem}.png does not contain editable draw.io metadata and a source hash.`,
          file: path.relative(config.projectDir, preview),
          remediation: "Run archwork diagrams export to refresh the preview metadata.",
        });
      } else if (
        metadata.sourceHash !== expectedHash ||
        metadata.mxfile !== drawio.toString("utf8")
      ) {
        diagnostics.push({
          code: "diagram.stale-preview",
          severity: "error",
          message: `Preview ${stem}.png is stale relative to its draw.io source.`,
          file: path.relative(config.projectDir, preview),
          remediation: "Re-export the diagram before committing it.",
        });
      }
    } catch (error) {
      diagnostics.push({
        code: "diagram.invalid-preview",
        severity: "error",
        message: `Cannot validate ${stem}.png: ${error instanceof Error ? error.message : String(error)}`,
        file: path.relative(config.projectDir, preview),
        remediation: "Re-export a valid PNG and embed its draw.io metadata.",
      });
    }
  }

  for (const [stem, preview] of previewByRelativeStem) {
    if (!sourceByRelativeStem.has(stem)) {
      diagnostics.push({
        code: "diagram.orphan-preview",
        severity: "error",
        message: `Preview ${stem}.png has no matching draw.io source.`,
        file: path.relative(config.projectDir, preview),
        remediation: "Add the editable source or remove the orphan preview.",
      });
    }
  }

  const semantic = await inspectDiagrams(config);
  diagnostics.push(...semantic.diagnostics);

  return diagnostics;
}

async function exists(candidate: string): Promise<boolean> {
  try {
    await access(candidate);
    return true;
  } catch {
    return false;
  }
}

async function resolveDrawioBinary(explicit?: string): Promise<string | undefined> {
  if (explicit) return explicit;
  if (process.env.DRAWIO_BIN) return process.env.DRAWIO_BIN;

  const paths =
    process.platform === "win32"
      ? [
          path.join(process.env.LOCALAPPDATA ?? "", "Programs", "draw.io", "draw.io.exe"),
          path.join(process.env.PROGRAMFILES ?? "", "draw.io", "draw.io.exe"),
        ]
      : [
          "/Applications/draw.io.app/Contents/MacOS/draw.io",
          "/usr/bin/drawio",
          "/usr/local/bin/drawio",
        ];
  for (const candidate of paths) {
    if (candidate && (await exists(candidate))) return candidate;
  }

  for (const candidate of ["drawio", "draw.io", "diagrams.net"]) {
    const check = spawnSync(candidate, ["--version"], {
      encoding: "utf8",
      shell: process.platform === "win32",
      timeout: 10_000,
    });
    if (!check.error && check.status === 0) return candidate;
  }
  return undefined;
}

export async function exportDiagrams(
  config: ResolvedArchitectureConfig,
  explicitBinary?: string,
): Promise<string[]> {
  const binary = await resolveDrawioBinary(explicitBinary);
  if (!binary) {
    throw new Error(
      "No diagrams.net executable was found. Install the draw.io desktop application, set DRAWIO_BIN, or pass --drawio-bin <path>. Existing committed previews can still be built and verified.",
    );
  }

  const sources = await collectFiles(config.diagramSourcePath, ".drawio");
  await mkdir(config.diagramRenderedPath, { recursive: true });
  const rendered: string[] = [];

  for (const source of sources) {
    const relative = path.relative(config.diagramSourcePath, source);
    const output = path.join(
      config.diagramRenderedPath,
      relative.slice(0, -path.extname(relative).length) + ".png",
    );
    await mkdir(path.dirname(output), { recursive: true });
    const result = spawnSync(binary, ["--export", "--format", "png", "--output", output, source], {
      encoding: "utf8",
      shell: process.platform === "win32" && !path.isAbsolute(binary),
      timeout: 120_000,
    });
    if (result.error || result.status !== 0) {
      const stderr = result.stderr.trim();
      const detail = stderr !== "" ? stderr : (result.error?.message ?? `exit ${result.status}`);
      throw new Error(`draw.io failed for ${relative}: ${detail}`);
    }
    if (config.diagrams.embedSource) await embedDiagramMetadata(output, source);
    rendered.push(output);
  }
  return rendered;
}
