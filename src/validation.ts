import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import { XMLParser } from "fast-xml-parser";
import JSZip from "jszip";

import { verifyDiagrams } from "./diagrams.js";
import type { Diagnostic, ParsedArchitecture, ResolvedArchitectureConfig } from "./types.js";

function withoutNumbering(value: string): string {
  return value
    .replace(/^\d+(?:\.\d+)*\.?\s+/, "")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase();
}

async function fileExists(file: string): Promise<boolean> {
  try {
    return (await stat(file)).isFile();
  } catch {
    return false;
  }
}

function numberingDiagnostic(
  level: number,
  text: string,
  line: number,
  source: string,
): Diagnostic | undefined {
  if (text.toLowerCase() === "table of contents") return undefined;
  const expected = level === 2 ? /^\d+\.\s+\S/ : /^\d+\.\d+(?:\.\d+)*\s+\S/;
  if (level < 2 || level > 4 || expected.test(text)) return undefined;
  return {
    code: "heading.explicit-numbering",
    severity: "warning",
    message: `Heading level ${level} is not explicitly numbered: ${text}`,
    file: source,
    line,
    remediation: level === 2 ? "Prefix the heading with N. " : "Prefix the heading with N.N ",
  };
}

function validateTables(markdown: string, source: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const lines = markdown.split(/\r?\n/);
  let index = 0;
  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (!line.trimStart().startsWith("|")) {
      index += 1;
      continue;
    }
    const start = index;
    const rows: string[] = [];
    while (index < lines.length && (lines[index] ?? "").trimStart().startsWith("|")) {
      rows.push(lines[index] ?? "");
      index += 1;
    }
    const widths = rows.map((row) => row.replace(/^\s*\||\|\s*$/g, "").split("|").length);
    if (rows.length < 2 || !/^\s*\|?\s*:?-{3,}/.test(rows[1] ?? "")) {
      diagnostics.push({
        code: "markdown.table-separator",
        severity: "error",
        message: "Markdown table is missing a valid header separator row.",
        file: source,
        line: start + 1,
        remediation: "Add a separator such as | --- | --- | immediately after the header.",
      });
    }
    if (new Set(widths).size > 1) {
      diagnostics.push({
        code: "markdown.table-columns",
        severity: "error",
        message: `Markdown table rows do not have a consistent column count: ${widths.join(", ")}.`,
        file: source,
        line: start + 1,
        remediation: "Make every row contain the same number of pipe-delimited cells.",
      });
    }
  }
  return diagnostics;
}

function validateSensitivePaths(
  markdown: string,
  config: ResolvedArchitectureConfig,
): Diagnostic[] {
  const patterns: { code: string; pattern: RegExp; message: string }[] = [
    {
      code: "content.windows-absolute-path",
      pattern: /[A-Za-z]:\\(?:Users|Documents and Settings|home)\\[^\s)`]+/gi,
      message: "Document contains a user-specific Windows path.",
    },
    {
      code: "content.posix-home-path",
      pattern: /\/(?:Users|home)\/[^\s)`]+/g,
      message: "Document contains a user-specific home-directory path.",
    },
  ];
  for (const [index, source] of config.quality.forbiddenPatterns.entries()) {
    try {
      patterns.push({
        code: `content.forbidden-pattern-${index + 1}`,
        pattern: new RegExp(source, "gi"),
        message: `Document matches configured forbidden pattern ${index + 1}.`,
      });
    } catch {
      return [
        {
          code: "config.invalid-forbidden-pattern",
          severity: "error",
          message: `quality.forbiddenPatterns contains invalid regular expression: ${source}`,
          file: path.relative(config.projectDir, config.configPath),
          remediation: "Correct or remove the invalid regular expression.",
        },
      ];
    }
  }

  const diagnostics: Diagnostic[] = [];
  const lines = markdown.split(/\r?\n/);
  for (const item of patterns) {
    for (const [lineIndex, line] of lines.entries()) {
      item.pattern.lastIndex = 0;
      if (!item.pattern.test(line)) continue;
      diagnostics.push({
        code: item.code,
        severity: "error",
        message: item.message,
        file: path.relative(config.projectDir, config.sourcePath),
        line: lineIndex + 1,
        remediation: "Replace the path or sensitive term with a portable placeholder.",
      });
    }
  }
  return diagnostics;
}

export async function validateProject(
  parsed: ParsedArchitecture,
  config: ResolvedArchitectureConfig,
  strict = false,
): Promise<Diagnostic[]> {
  const diagnostics: Diagnostic[] = [];
  const sourceFile = path.relative(config.projectDir, config.sourcePath);
  const headingNames = new Set(
    parsed.headings
      .filter((heading) => heading.level === 2)
      .map((heading) => withoutNumbering(heading.text)),
  );

  if (path.extname(config.outputPath).toLowerCase() !== ".docx") {
    diagnostics.push({
      code: "config.output-extension",
      severity: "error",
      message: "document.output must use the .docx extension.",
      file: path.relative(config.projectDir, config.configPath),
    });
  }

  for (const required of config.quality.requiredSections) {
    if (!headingNames.has(withoutNumbering(required))) {
      diagnostics.push({
        code: "section.required",
        severity: "warning",
        message: `Required main section is missing: ${required}`,
        file: sourceFile,
        remediation: `Add an H2 section for ${required}.`,
      });
    }
  }

  if (config.document.requireExplicitNumbering) {
    for (const heading of parsed.headings) {
      const diagnostic = numberingDiagnostic(heading.level, heading.text, heading.line, sourceFile);
      if (diagnostic) diagnostics.push(diagnostic);
    }
  }

  for (const block of parsed.blocks) {
    if (block.kind !== "image") continue;
    if (/^(https?:|data:)/i.test(block.path)) {
      diagnostics.push({
        code: "image.remote",
        severity: "error",
        message: `Remote image is not allowed in a deterministic build: ${block.path}`,
        file: sourceFile,
        line: block.line,
        remediation: "Commit a local PNG preview and reference it with a relative path.",
      });
      continue;
    }
    const imagePath = path.resolve(config.projectDir, block.path);
    const relative = path.relative(config.projectDir, imagePath);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      diagnostics.push({
        code: "image.outside-project",
        severity: "error",
        message: `Image reference escapes the project directory: ${block.path}`,
        file: sourceFile,
        line: block.line,
        remediation: "Place the image under the project and use a relative path.",
      });
    } else if (!(await fileExists(imagePath))) {
      diagnostics.push({
        code: "image.missing",
        severity: "error",
        message: `Referenced image does not exist: ${block.path}`,
        file: sourceFile,
        line: block.line,
        remediation: "Add the image or correct the Markdown reference.",
      });
    } else if (path.extname(imagePath).toLowerCase() !== ".png") {
      diagnostics.push({
        code: "image.not-png",
        severity: "error",
        message: `DOCX diagrams must use PNG previews: ${block.path}`,
        file: sourceFile,
        line: block.line,
        remediation: "Export the diagram as PNG for consistent Google Drive rendering.",
      });
    }
  }

  for (const block of parsed.blocks) {
    if (block.kind === "code" && (block.text.match(/->/g)?.length ?? 0) >= 2) {
      diagnostics.push({
        code: "content.text-arrow-flow",
        severity: "warning",
        message: "A code block appears to describe a multi-step arrow flow.",
        file: sourceFile,
        line: block.line,
        remediation:
          "Use a sequence, state, or workflow diagram and keep the prose as a concise explanation.",
      });
    }
  }

  diagnostics.push(...validateTables(parsed.source, sourceFile));
  diagnostics.push(...validateSensitivePaths(parsed.source, config));
  diagnostics.push(...(await verifyDiagrams(config)));

  if (strict) {
    return diagnostics.map((diagnostic) =>
      diagnostic.severity === "warning"
        ? { ...diagnostic, severity: "error" as const }
        : diagnostic,
    );
  }
  return diagnostics;
}

export async function validateDocx(
  docxPath: string,
  config: ResolvedArchitectureConfig,
): Promise<Diagnostic[]> {
  const diagnostics: Diagnostic[] = [];
  let data: Buffer;
  try {
    data = await readFile(docxPath);
  } catch (error) {
    return [
      {
        code: "docx.missing",
        severity: "error",
        message: `Cannot read generated DOCX: ${error instanceof Error ? error.message : String(error)}`,
        file: path.relative(config.projectDir, docxPath),
      },
    ];
  }

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(data, { checkCRC32: true });
  } catch (error) {
    return [
      {
        code: "docx.invalid-package",
        severity: "error",
        message: `DOCX ZIP package is invalid: ${error instanceof Error ? error.message : String(error)}`,
        file: path.relative(config.projectDir, docxPath),
      },
    ];
  }

  const required = [
    "[Content_Types].xml",
    "_rels/.rels",
    "word/document.xml",
    "word/styles.xml",
    "word/numbering.xml",
    "word/_rels/document.xml.rels",
  ];
  for (const entry of required) {
    if (!zip.file(entry)) {
      diagnostics.push({
        code: "docx.missing-part",
        severity: "error",
        message: `DOCX package is missing required part ${entry}.`,
        file: path.relative(config.projectDir, docxPath),
      });
    }
  }
  if (diagnostics.some((diagnostic) => diagnostic.severity === "error")) return diagnostics;

  const documentPart = zip.file("word/document.xml");
  const relationshipPart = zip.file("word/_rels/document.xml.rels");
  const contentTypesPart = zip.file("[Content_Types].xml");
  if (!documentPart || !relationshipPart || !contentTypesPart) return diagnostics;
  const documentXml = await documentPart.async("string");
  const relationshipXml = await relationshipPart.async("string");
  const contentTypesXml = await contentTypesPart.async("string");
  const parser = new XMLParser({ ignoreAttributes: false, allowBooleanAttributes: true });
  const xmlParts: [string, string][] = [
    ["word/document.xml", documentXml],
    ["word/_rels/document.xml.rels", relationshipXml],
    ["[Content_Types].xml", contentTypesXml],
  ];
  for (const [name, xml] of xmlParts) {
    try {
      parser.parse(xml);
    } catch (error) {
      diagnostics.push({
        code: "docx.invalid-xml",
        severity: "error",
        message: `${name} is not valid XML: ${error instanceof Error ? error.message : String(error)}`,
        file: path.relative(config.projectDir, docxPath),
      });
    }
  }

  const expectations: [string, RegExp, string][] = [
    ["docx.heading-styles", /w:pStyle[^>]+w:val="Heading2"/, "No Heading 2 styles were found."],
    ["docx.bookmarks", /w:bookmarkStart/, "No heading bookmarks were found."],
    ["docx.tables", /<w:tbl[ >]/, "No real Word tables were found."],
  ];
  if (config.document.toc.mode === "static") {
    expectations.push([
      "docx.toc-links",
      /w:hyperlink[^>]+w:anchor=/,
      "No internal TOC hyperlinks were found.",
    ]);
  }
  for (const [code, pattern, message] of expectations) {
    if (!pattern.test(documentXml)) {
      diagnostics.push({
        code,
        severity: "error",
        message,
        file: path.relative(config.projectDir, docxPath),
      });
    }
  }

  const bookmarkStarts = [
    ...documentXml.matchAll(/<w:bookmarkStart\b[^>]*w:id="([^"]+)"[^>]*>/g),
  ].map((match) => match[1]);
  const bookmarkEnds = [...documentXml.matchAll(/<w:bookmarkEnd\b[^>]*w:id="([^"]+)"[^>]*>/g)].map(
    (match) => match[1],
  );
  if (new Set(bookmarkStarts).size !== bookmarkStarts.length) {
    diagnostics.push({
      code: "docx.duplicate-bookmark-id",
      severity: "error",
      message: "Generated heading bookmarks do not have unique numeric IDs.",
      file: path.relative(config.projectDir, docxPath),
    });
  }
  if (
    bookmarkStarts.length !== bookmarkEnds.length ||
    bookmarkStarts.some((id, index) => id !== bookmarkEnds[index])
  ) {
    diagnostics.push({
      code: "docx.unmatched-bookmark",
      severity: "error",
      message: "Generated bookmark start and end IDs do not match.",
      file: path.relative(config.projectDir, docxPath),
    });
  }

  if (/!\[[^\]]*\]\(/.test(documentXml)) {
    diagnostics.push({
      code: "docx.visible-markdown-image",
      severity: "error",
      message: "Generated DOCX contains visible Markdown image syntax.",
      file: path.relative(config.projectDir, docxPath),
    });
  }

  const mediaEntries = Object.keys(zip.files).filter(
    (name) => name.startsWith("word/media/") && name.endsWith(".png"),
  );
  const imageTargets = [...relationshipXml.matchAll(/Target="media\/([^"]+\.png)"/g)].map(
    (match) => `word/media/${match[1]}`,
  );
  for (const target of imageTargets) {
    if (!zip.file(target)) {
      diagnostics.push({
        code: "docx.broken-image-relationship",
        severity: "error",
        message: `DOCX image relationship points to missing part ${target}.`,
        file: path.relative(config.projectDir, docxPath),
      });
    }
  }
  if (
    mediaEntries.length > 0 &&
    !/<Default(?=[^>]*Extension="png")(?=[^>]*ContentType="image\/png")[^>]*\/>/.test(
      contentTypesXml,
    )
  ) {
    diagnostics.push({
      code: "docx.png-content-type",
      severity: "error",
      message: "DOCX package embeds PNG files without a PNG content type declaration.",
      file: path.relative(config.projectDir, docxPath),
    });
  }
  if (mediaEntries.length > 0 && !/wp:docPr[^>]+descr="[^"]+"/.test(documentXml)) {
    diagnostics.push({
      code: "docx.image-alt-text",
      severity: "error",
      message: "Embedded images are missing alternative-text descriptions.",
      file: path.relative(config.projectDir, docxPath),
    });
  }
  return diagnostics;
}

export async function readAndParseSource(
  config: ResolvedArchitectureConfig,
  parse: (source: string) => ParsedArchitecture,
): Promise<ParsedArchitecture> {
  return parse(await readFile(config.sourcePath, "utf8"));
}
