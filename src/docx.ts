import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import JSZip from "jszip";

import {
  AlignmentType,
  Bookmark,
  BorderStyle,
  Document,
  ExternalHyperlink,
  FileChild,
  Footer,
  HeadingLevel,
  ImageRun,
  INumberingOptions,
  InternalHyperlink,
  LevelFormat,
  Packer,
  PageNumber,
  PageOrientation,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableOfContents,
  TableRow,
  TextRun,
  WidthType,
} from "docx";

import { inlineText } from "./markdown.js";
import type {
  DocumentBlock,
  HeadingBlock,
  InlineContent,
  ParsedArchitecture,
  ResolvedArchitectureConfig,
} from "./types.js";

const DXA_PER_INCH = 1440;
const LETTER_WIDTH = 12_240;
const LETTER_HEIGHT = 15_840;
const A4_WIDTH = 11_906;
const A4_HEIGHT = 16_838;
const DEFAULT_FONT = "Arial";
const ACCENT = "1F5A7A";
const LIGHT_ACCENT = "DDEBF3";
const TEXT = "173042";
const BORDER = "AFC3CF";

type InlineRun = TextRun | ExternalHyperlink | InternalHyperlink;

function headingLevel(level: number) {
  switch (level) {
    case 1:
      return HeadingLevel.HEADING_1;
    case 2:
      return HeadingLevel.HEADING_2;
    case 3:
      return HeadingLevel.HEADING_3;
    case 4:
      return HeadingLevel.HEADING_4;
    case 5:
      return HeadingLevel.HEADING_5;
    default:
      return HeadingLevel.HEADING_6;
  }
}

function textRun(item: InlineContent, linkStyle = false): TextRun {
  return new TextRun({
    text: item.text,
    font: item.code ? "Consolas" : DEFAULT_FONT,
    ...(item.bold ? { bold: true } : {}),
    ...(item.italic ? { italics: true } : {}),
    ...(linkStyle ? { style: "Hyperlink" } : {}),
    ...(item.code ? { shading: { fill: "F1F4F6", type: ShadingType.CLEAR } } : {}),
  });
}

function anchorFromHref(href: string, headings: HeadingBlock[]): string | undefined {
  if (!href.startsWith("#")) return undefined;
  const requested = href
    .slice(1)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return headings.find(
    (heading) =>
      heading.text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") === requested,
  )?.bookmark;
}

function inlineRuns(content: InlineContent[], headings: HeadingBlock[]): InlineRun[] {
  return content.map((item) => {
    if (item.href?.startsWith("#")) {
      const anchor = anchorFromHref(item.href, headings);
      if (anchor) {
        return new InternalHyperlink({
          anchor,
          children: [textRun(item, true)],
        });
      }
    }
    if (item.href && /^(https?:|mailto:)/i.test(item.href)) {
      return new ExternalHyperlink({
        link: item.href,
        children: [textRun(item, true)],
      });
    }
    return textRun(item);
  });
}

function pngSize(data: Buffer): { width: number; height: number } {
  const signature = data.subarray(0, 8);
  if (!signature.equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) || data.length < 24) {
    throw new Error("Only valid PNG diagram previews are supported");
  }
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
}

function fitImage(
  width: number,
  height: number,
  maxWidth: number,
  maxHeight = 650,
): { width: number; height: number } {
  const scale = Math.min(maxWidth / width, maxHeight / height, 1);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function pageMetrics(config: ResolvedArchitectureConfig): {
  width: number;
  height: number;
  contentWidth: number;
  margin: number;
  imageWidthPixels: number;
} {
  const portraitWidth = config.document.page.size === "letter" ? LETTER_WIDTH : A4_WIDTH;
  const portraitHeight = config.document.page.size === "letter" ? LETTER_HEIGHT : A4_HEIGHT;
  const landscape = config.document.page.orientation === "landscape";
  const width = landscape ? portraitHeight : portraitWidth;
  const height = landscape ? portraitWidth : portraitHeight;
  const margin = Math.round(config.document.page.marginInches * DXA_PER_INCH);
  const contentWidth = width - margin * 2;
  return {
    width,
    height,
    margin,
    contentWidth,
    imageWidthPixels: Math.round((contentWidth / DXA_PER_INCH) * 96),
  };
}

function tableColumnWidths(rows: InlineContent[][][], contentWidth: number): number[] {
  const columns = Math.max(...rows.map((row) => row.length));
  if (columns <= 0) return [];
  const weights = Array.from({ length: columns }, (_, column) =>
    Math.max(8, ...rows.map((row) => inlineText(row[column] ?? []).length)),
  );
  const capped = weights.map((weight) => Math.min(weight, 48));
  const total = capped.reduce((sum, weight) => sum + weight, 0);
  const widths = capped.map((weight) => Math.floor((contentWidth * weight) / total));
  widths[widths.length - 1] =
    contentWidth - widths.slice(0, -1).reduce((sum, width) => sum + width, 0);
  return widths;
}

function createTable(
  block: Extract<DocumentBlock, { kind: "table" }>,
  contentWidth: number,
  headings: HeadingBlock[],
): Table {
  const widths = tableColumnWidths(block.rows, contentWidth);
  const border = { style: BorderStyle.SINGLE, size: 4, color: BORDER };
  return new Table({
    width: { size: contentWidth, type: WidthType.DXA },
    columnWidths: widths,
    layout: TableLayoutType.FIXED,
    rows: block.rows.map(
      (row, rowIndex) =>
        new TableRow({
          cantSplit: true,
          tableHeader: rowIndex === 0,
          children: widths.map(
            (width, columnIndex) =>
              new TableCell({
                width: { size: width, type: WidthType.DXA },
                borders: { top: border, bottom: border, left: border, right: border },
                margins: { top: 100, bottom: 100, left: 120, right: 120 },
                ...(rowIndex === 0
                  ? { shading: { fill: LIGHT_ACCENT, type: ShadingType.CLEAR } }
                  : {}),
                children: [
                  new Paragraph({
                    children: inlineRuns(row[columnIndex] ?? [], headings),
                    spacing: { after: 0 },
                  }),
                ],
              }),
          ),
        }),
    ),
  });
}

async function createImageBlocks(
  block: Extract<DocumentBlock, { kind: "image" }>,
  config: ResolvedArchitectureConfig,
  maxWidth: number,
): Promise<FileChild[]> {
  if (/^(https?:|data:)/i.test(block.path)) {
    throw new Error(`Remote images are not supported in deterministic builds: ${block.path}`);
  }
  const imagePath = path.resolve(config.projectDir, block.path);
  const data = await readFile(imagePath);
  const dimensions = pngSize(data);
  const fitted = fitImage(dimensions.width, dimensions.height, maxWidth);
  const description = block.title ?? block.alt;
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 160, after: 80 },
      children: [
        new ImageRun({
          type: "png",
          data,
          transformation: fitted,
          altText: { name: path.basename(imagePath), title: block.alt, description },
        }),
      ],
    }),
    new Paragraph({
      style: "Caption",
      alignment: AlignmentType.CENTER,
      spacing: { after: 180 },
      children: [new TextRun({ text: block.alt, italics: true, color: "496675" })],
    }),
  ];
}

function staticToc(parsed: ParsedArchitecture, depth: number): Paragraph[] {
  return parsed.headings
    .filter(
      (heading) =>
        heading.level >= 2 &&
        heading.level <= depth &&
        heading.text.toLowerCase() !== "table of contents",
    )
    .map(
      (heading) =>
        new Paragraph({
          indent: { left: Math.max(0, heading.level - 2) * 360 },
          spacing: { after: 80 },
          children: [
            new InternalHyperlink({
              anchor: heading.bookmark,
              children: [new TextRun({ text: heading.text, style: "Hyperlink", color: ACCENT })],
            }),
          ],
        }),
    );
}

function numberingConfigs(parsed: ParsedArchitecture): INumberingOptions["config"] {
  const configs: INumberingOptions["config"][number][] = [
    {
      reference: "archwork-bullets",
      levels: [
        {
          level: 0,
          format: LevelFormat.BULLET,
          text: "•",
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } },
        },
      ],
    },
  ];
  let orderedIndex = 0;
  for (const block of parsed.blocks) {
    if (block.kind !== "ordered-list") continue;
    configs.push({
      reference: `archwork-numbers-${orderedIndex}`,
      levels: [
        {
          level: 0,
          format: LevelFormat.DECIMAL,
          text: "%1.",
          alignment: AlignmentType.LEFT,
          start: block.start,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } },
        },
      ],
    });
    orderedIndex += 1;
  }
  return configs;
}

async function buildChildren(
  parsed: ParsedArchitecture,
  config: ResolvedArchitectureConfig,
): Promise<FileChild[]> {
  const metrics = pageMetrics(config);
  const children: FileChild[] = [];
  let orderedIndex = 0;

  for (const block of parsed.blocks) {
    switch (block.kind) {
      case "heading": {
        const isToc = block.text.toLowerCase() === "table of contents";
        if (isToc && config.document.toc.mode === "field") {
          children.push(
            new TableOfContents("Table of Contents", {
              hyperlink: true,
              headingStyleRange: `1-${config.document.toc.depth}`,
            }),
          );
          break;
        }
        children.push(
          new Paragraph({
            heading: headingLevel(block.level),
            children: [
              new Bookmark({
                id: block.bookmark,
                children: [new TextRun({ text: block.text })],
              }),
            ],
          }),
        );
        if (isToc) children.push(...staticToc(parsed, config.document.toc.depth));
        break;
      }
      case "paragraph":
        children.push(
          new Paragraph({
            spacing: { after: 140, line: 300 },
            children: inlineRuns(block.content, parsed.headings),
          }),
        );
        break;
      case "image":
        children.push(...(await createImageBlocks(block, config, metrics.imageWidthPixels)));
        break;
      case "bullet-list":
        for (const item of block.items) {
          children.push(
            new Paragraph({
              numbering: { reference: "archwork-bullets", level: 0 },
              spacing: { after: 80 },
              children: inlineRuns(item, parsed.headings),
            }),
          );
        }
        break;
      case "ordered-list": {
        const reference = `archwork-numbers-${orderedIndex}`;
        orderedIndex += 1;
        for (const item of block.items) {
          children.push(
            new Paragraph({
              numbering: { reference, level: 0 },
              spacing: { after: 80 },
              children: inlineRuns(item, parsed.headings),
            }),
          );
        }
        break;
      }
      case "table":
        children.push(createTable(block, metrics.contentWidth, parsed.headings));
        children.push(new Paragraph({ spacing: { after: 120 } }));
        break;
      case "code":
        for (const line of block.text.split("\n")) {
          children.push(
            new Paragraph({
              shading: { fill: "F1F4F6", type: ShadingType.CLEAR },
              spacing: { after: 0, before: 0 },
              indent: { left: 180, right: 180 },
              children: [new TextRun({ text: line || " ", font: "Consolas", size: 19 })],
            }),
          );
        }
        children.push(new Paragraph({ spacing: { after: 120 } }));
        break;
      case "quote":
        children.push(
          new Paragraph({
            border: { left: { style: BorderStyle.SINGLE, size: 16, color: ACCENT, space: 10 } },
            indent: { left: 360, right: 180 },
            spacing: { after: 140 },
            children: inlineRuns(block.content, parsed.headings),
          }),
        );
        break;
      case "rule":
        children.push(
          new Paragraph({
            border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: BORDER, space: 1 } },
          }),
        );
        break;
    }
  }
  return children;
}

export async function createDocx(
  parsed: ParsedArchitecture,
  config: ResolvedArchitectureConfig,
): Promise<Buffer> {
  const metrics = pageMetrics(config);
  const children = await buildChildren(parsed, config);
  const doc = new Document({
    creator: config.document.author,
    lastModifiedBy: config.document.author,
    title: config.document.title,
    ...(config.document.subject
      ? { subject: config.document.subject, description: config.document.subject }
      : {}),
    keywords: config.document.keywords.join(", "),
    styles: {
      default: {
        document: { run: { font: DEFAULT_FONT, size: 22, color: TEXT } },
      },
      paragraphStyles: [
        {
          id: "Heading1",
          name: "Heading 1",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { font: DEFAULT_FONT, size: 38, bold: true, color: "123B52" },
          paragraph: { spacing: { before: 0, after: 260 }, outlineLevel: 0 },
        },
        {
          id: "Heading2",
          name: "Heading 2",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { font: DEFAULT_FONT, size: 31, bold: true, color: ACCENT },
          paragraph: { spacing: { before: 300, after: 150 }, outlineLevel: 1 },
        },
        {
          id: "Heading3",
          name: "Heading 3",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { font: DEFAULT_FONT, size: 26, bold: true, color: "2C5268" },
          paragraph: { spacing: { before: 240, after: 110 }, outlineLevel: 2 },
        },
        {
          id: "Heading4",
          name: "Heading 4",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { font: DEFAULT_FONT, size: 23, bold: true, color: "365E73" },
          paragraph: { spacing: { before: 200, after: 90 }, outlineLevel: 3 },
        },
        {
          id: "Caption",
          name: "Caption",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { font: DEFAULT_FONT, size: 19, italics: true, color: "496675" },
          paragraph: { spacing: { after: 180 } },
        },
      ],
    },
    numbering: { config: numberingConfigs(parsed) },
    sections: [
      {
        properties: {
          page: {
            size: {
              width:
                config.document.page.orientation === "landscape" ? metrics.height : metrics.width,
              height:
                config.document.page.orientation === "landscape" ? metrics.width : metrics.height,
              orientation:
                config.document.page.orientation === "landscape"
                  ? PageOrientation.LANDSCAPE
                  : PageOrientation.PORTRAIT,
            },
            margin: {
              top: metrics.margin,
              right: metrics.margin,
              bottom: metrics.margin,
              left: metrics.margin,
              header: 720,
              footer: 720,
            },
          },
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({ text: `${config.document.title}  |  `, size: 18, color: "607784" }),
                  new TextRun({ children: [PageNumber.CURRENT], size: 18, color: "607784" }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });
  return normalizeBookmarkIds(await Packer.toBuffer(doc));
}

async function normalizeBookmarkIds(buffer: Buffer): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buffer);
  const documentPart = zip.file("word/document.xml");
  if (!documentPart) throw new Error("Generated DOCX is missing word/document.xml");
  const xml = await documentPart.async("string");
  const active: number[] = [];
  let nextId = 1;
  const normalized = xml.replace(/<w:bookmark(Start|End)\b[^>]*\/>/g, (element, kind: string) => {
    let id: number;
    if (kind === "Start") {
      id = nextId++;
      active.push(id);
    } else {
      const matchingId = active.pop();
      if (matchingId === undefined) {
        throw new Error("Generated DOCX contains an unmatched bookmark end");
      }
      id = matchingId;
    }
    return element.replace(/w:id="[^"]+"/, `w:id="${id}"`);
  });
  if (active.length > 0) throw new Error("Generated DOCX contains an unmatched bookmark start");
  zip.file("word/document.xml", normalized);
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

export async function writeDocx(
  parsed: ParsedArchitecture,
  config: ResolvedArchitectureConfig,
): Promise<string> {
  const buffer = await createDocx(parsed, config);
  await mkdir(path.dirname(config.outputPath), { recursive: true });
  await writeFile(config.outputPath, buffer);
  return config.outputPath;
}
