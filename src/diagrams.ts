import { createHash } from "node:crypto";
import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { deflateSync, inflateSync } from "node:zlib";

import type { Diagnostic, DiagramMetadata, ResolvedArchitectureConfig } from "./types.js";

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
