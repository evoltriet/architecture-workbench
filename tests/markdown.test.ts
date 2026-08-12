import { describe, expect, it } from "vitest";

import { parseArchitecture } from "../src/markdown.js";

describe("parseArchitecture", () => {
  it("parses native architecture blocks and unique heading bookmarks", () => {
    const parsed = parseArchitecture(`# Example

## 1. Overview

Text with **strong**, *emphasis*, \`code\`, and [a link](https://example.com).

- First
- Second

| Name | Value |
| --- | --- |
| Runtime | 30 seconds |

![Context](diagrams/rendered/context.png)

## 2. Overview
`);

    expect(parsed.blocks.map((block) => block.kind)).toEqual([
      "heading",
      "heading",
      "paragraph",
      "bullet-list",
      "table",
      "image",
      "heading",
    ]);
    expect(parsed.headings).toHaveLength(3);
    expect(new Set(parsed.headings.map((heading) => heading.bookmark)).size).toBe(3);
    const paragraph = parsed.blocks.find((block) => block.kind === "paragraph");
    expect(paragraph?.kind === "paragraph" ? paragraph.content : []).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: "strong", bold: true }),
        expect.objectContaining({ text: "emphasis", italic: true }),
        expect.objectContaining({ text: "code", code: true }),
        expect.objectContaining({ text: "a link", href: "https://example.com" }),
      ]),
    );
  });
});
