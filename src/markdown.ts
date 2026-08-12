import MarkdownIt from "markdown-it";
import type Token from "markdown-it/lib/token.mjs";

import type { DocumentBlock, InlineContent, ParsedArchitecture } from "./types.js";

const parser = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
});

type InlineState = {
  bold: boolean;
  italic: boolean;
  href?: string;
};

function appendInline(
  output: InlineContent[],
  text: string,
  state: InlineState,
  extra: Partial<InlineContent> = {},
): void {
  if (!text) return;
  const item: InlineContent = { text };
  if (state.bold) item.bold = true;
  if (state.italic) item.italic = true;
  if (state.href) item.href = state.href;
  Object.assign(item, extra);
  output.push(item);
}

export function parseInlineTokens(tokens: Token[] = []): InlineContent[] {
  const output: InlineContent[] = [];
  const state: InlineState = { bold: false, italic: false };

  for (const token of tokens) {
    switch (token.type) {
      case "text":
        appendInline(output, token.content, state);
        break;
      case "code_inline":
        appendInline(output, token.content, state, { code: true });
        break;
      case "softbreak":
      case "hardbreak":
        appendInline(output, " ", state);
        break;
      case "strong_open":
        state.bold = true;
        break;
      case "strong_close":
        state.bold = false;
        break;
      case "em_open":
        state.italic = true;
        break;
      case "em_close":
        state.italic = false;
        break;
      case "link_open": {
        const href = token.attrGet("href");
        if (href) state.href = href;
        break;
      }
      case "link_close":
        delete state.href;
        break;
      case "image": {
        const content = token.content.trim();
        appendInline(output, content !== "" ? content : (token.attrGet("alt") ?? "Image"), state);
        break;
      }
      default:
        if (token.content) appendInline(output, token.content, state);
    }
  }

  return mergeAdjacentInline(output);
}

function mergeAdjacentInline(content: InlineContent[]): InlineContent[] {
  const merged: InlineContent[] = [];
  for (const item of content) {
    const previous = merged.at(-1);
    if (
      previous &&
      previous.bold === item.bold &&
      previous.italic === item.italic &&
      previous.code === item.code &&
      previous.href === item.href
    ) {
      previous.text += item.text;
    } else {
      merged.push({ ...item });
    }
  }
  return merged;
}

export function inlineText(content: InlineContent[]): string {
  return content
    .map((item) => item.text)
    .join("")
    .trim();
}

function lineOf(token: Token): number {
  return (token.map?.[0] ?? 0) + 1;
}

function slugBase(text: string): string {
  const slug = text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 34);
  return `section_${slug || "heading"}`;
}

function uniqueBookmark(text: string, counts: Map<string, number>): string {
  const base = slugBase(text);
  const next = (counts.get(base) ?? 0) + 1;
  counts.set(base, next);
  return next === 1 ? base : `${base.slice(0, 36)}_${next}`;
}

function paragraphImage(
  token: Token | undefined,
): { alt: string; path: string; title?: string } | undefined {
  const children = token?.children?.filter(
    (child) => !(child.type === "text" && child.content.trim() === ""),
  );
  if (children?.length !== 1 || children[0]?.type !== "image") return undefined;
  const image = children[0];
  const src = image.attrGet("src");
  if (!src) return undefined;
  const content = image.content.trim();
  const result: { alt: string; path: string; title?: string } = {
    alt: content !== "" ? content : (image.attrGet("alt") ?? "Architecture diagram"),
    path: src,
  };
  const title = image.attrGet("title");
  if (title) result.title = title;
  return result;
}

function parseList(tokens: Token[], start: number): { block: DocumentBlock; next: number } {
  const opening = tokens[start];
  if (!opening) throw new Error("Unexpected end of Markdown token stream");
  const ordered = opening.type === "ordered_list_open";
  const closeType = ordered ? "ordered_list_close" : "bullet_list_close";
  const items: InlineContent[][] = [];
  let current: InlineContent[] = [];
  let depth = 0;
  let index = start + 1;

  for (; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token) break;
    if (token.type === opening.type) depth += 1;
    if (token.type === closeType) {
      if (depth === 0) break;
      depth -= 1;
    }
    if (depth > 0) continue;
    if (token.type === "list_item_open") current = [];
    if (token.type === "inline") current.push(...parseInlineTokens(token.children ?? []));
    if (token.type === "list_item_close") items.push(mergeAdjacentInline(current));
  }

  if (ordered) {
    return {
      block: {
        kind: "ordered-list",
        items,
        start: Number(opening.attrGet("start") ?? "1"),
        line: lineOf(opening),
      },
      next: index + 1,
    };
  }
  return {
    block: { kind: "bullet-list", items, line: lineOf(opening) },
    next: index + 1,
  };
}

function parseTable(tokens: Token[], start: number): { block: DocumentBlock; next: number } {
  const opening = tokens[start];
  if (!opening) throw new Error("Unexpected end of Markdown token stream");
  const rows: InlineContent[][][] = [];
  let row: InlineContent[][] = [];
  let index = start + 1;
  for (; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token || token.type === "table_close") break;
    if (token.type === "tr_open") row = [];
    if (
      (token.type === "th_open" || token.type === "td_open") &&
      tokens[index + 1]?.type === "inline"
    ) {
      row.push(parseInlineTokens(tokens[index + 1]?.children ?? []));
    }
    if (token.type === "tr_close") rows.push(row);
  }
  return {
    block: { kind: "table", rows, line: lineOf(opening) },
    next: index + 1,
  };
}

function parseQuote(tokens: Token[], start: number): { block: DocumentBlock; next: number } {
  const opening = tokens[start];
  if (!opening) throw new Error("Unexpected end of Markdown token stream");
  const content: InlineContent[] = [];
  let depth = 0;
  let index = start + 1;
  for (; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token) break;
    if (token.type === "blockquote_open") depth += 1;
    if (token.type === "blockquote_close") {
      if (depth === 0) break;
      depth -= 1;
    }
    if (token.type === "inline") content.push(...parseInlineTokens(token.children ?? []));
  }
  return {
    block: { kind: "quote", content: mergeAdjacentInline(content), line: lineOf(opening) },
    next: index + 1,
  };
}

export function parseArchitecture(markdown: string): ParsedArchitecture {
  const tokens = parser.parse(markdown, {});
  const blocks: DocumentBlock[] = [];
  const headings: ParsedArchitecture["headings"] = [];
  const bookmarks = new Map<string, number>();

  let index = 0;
  while (index < tokens.length) {
    const token = tokens[index];
    if (!token) break;

    if (token.type === "heading_open") {
      const inline = tokens[index + 1];
      const content = parseInlineTokens(inline?.children ?? []);
      const text = inlineText(content);
      const block = {
        kind: "heading" as const,
        level: Number(token.tag.slice(1)),
        text,
        content,
        line: lineOf(token),
        bookmark: uniqueBookmark(text, bookmarks),
      };
      blocks.push(block);
      headings.push(block);
      index += 3;
      continue;
    }

    if (token.type === "paragraph_open") {
      const inline = tokens[index + 1];
      const image = paragraphImage(inline);
      if (image) {
        blocks.push({ kind: "image", ...image, line: lineOf(token) });
      } else {
        blocks.push({
          kind: "paragraph",
          content: parseInlineTokens(inline?.children ?? []),
          line: lineOf(token),
        });
      }
      index += 3;
      continue;
    }

    if (token.type === "bullet_list_open" || token.type === "ordered_list_open") {
      const parsed = parseList(tokens, index);
      blocks.push(parsed.block);
      index = parsed.next;
      continue;
    }

    if (token.type === "table_open") {
      const parsed = parseTable(tokens, index);
      blocks.push(parsed.block);
      index = parsed.next;
      continue;
    }

    if (token.type === "fence" || token.type === "code_block") {
      const block: DocumentBlock = {
        kind: "code",
        text: token.content.replace(/\n$/, ""),
        line: lineOf(token),
      };
      const language = token.info.trim().split(/\s+/)[0];
      if (language) block.language = language;
      blocks.push(block);
      index += 1;
      continue;
    }

    if (token.type === "blockquote_open") {
      const parsed = parseQuote(tokens, index);
      blocks.push(parsed.block);
      index = parsed.next;
      continue;
    }

    if (token.type === "hr") {
      blocks.push({ kind: "rule", line: lineOf(token) });
    }

    index += 1;
  }

  return { source: markdown, blocks, headings };
}
