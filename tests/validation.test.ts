import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { loadConfig } from "../src/config.js";
import { parseArchitecture } from "../src/markdown.js";
import { validateProject } from "../src/validation.js";

describe("project validation", () => {
  it("strictly validates the reference architecture", async () => {
    const config = await loadConfig("examples/service-fulfillment/architecture.yaml");
    const parsed = parseArchitecture(await readFile(config.sourcePath, "utf8"));
    expect(await validateProject(parsed, config, true)).toEqual([]);
  });

  it("reports numbering, missing image, and text-arrow flow diagnostics", async () => {
    const config = await loadConfig("examples/service-fulfillment/architecture.yaml");
    const parsed = parseArchitecture(`# Test

## Overview

![Missing](diagrams/rendered/missing.png)

\`\`\`text
A -> B -> C
\`\`\`
`);
    const codes = (await validateProject(parsed, config, false)).map((item) => item.code);
    expect(codes).toContain("heading.explicit-numbering");
    expect(codes).toContain("image.missing");
    expect(codes).toContain("content.text-arrow-flow");
    expect(codes).toContain("section.required");
  });
});
