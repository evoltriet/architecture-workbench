import { readFile } from "node:fs/promises";
import path from "node:path";

import { packageRoot } from "./project.js";

export type PromptName =
  "discover" | "draft" | "behavioral-critique" | "security-critique" | "hosting-review" | "revise";

export type PromptDefinition = {
  name: PromptName;
  title: string;
  description: string;
  file: string;
  arguments: { name: string; description: string; required: boolean }[];
};

const DEFINITIONS: PromptDefinition[] = [
  {
    name: "discover",
    title: "Architecture Discovery Interview",
    description: "Establish a decision-complete brief before design work begins.",
    file: "discovery-interview.md",
    arguments: [
      { name: "audience", description: "Primary decision audience", required: false },
      { name: "focus", description: "Known scope or problem focus", required: false },
    ],
  },
  {
    name: "draft",
    title: "Architecture Drafting",
    description: "Draft architecture content from verified records and explicit assumptions.",
    file: "architecture-drafting.md",
    arguments: [
      { name: "audience", description: "Primary decision audience", required: false },
      { name: "focus", description: "Sections or concerns to prioritize", required: false },
    ],
  },
  {
    name: "behavioral-critique",
    title: "Behavioral Gap Analysis",
    description: "Critique runtime, API, state, retry, and human-intervention behavior.",
    file: "behavioral-gap-analysis.md",
    arguments: [{ name: "focus", description: "Optional behavior focus", required: false }],
  },
  {
    name: "security-critique",
    title: "Security Critique",
    description: "Review trust boundaries, sensitive data, identity, and evidence handling.",
    file: "security-critique.md",
    arguments: [{ name: "focus", description: "Optional security focus", required: false }],
  },
  {
    name: "hosting-review",
    title: "Hosting Team Review",
    description: "Review capacity, deployment, network, ownership, and operating readiness.",
    file: "hosting-team-review.md",
    arguments: [{ name: "focus", description: "Optional hosting focus", required: false }],
  },
  {
    name: "revise",
    title: "Revision Synthesis",
    description: "Revise architecture content against findings without inventing evidence.",
    file: "revision-synthesis.md",
    arguments: [
      { name: "focus", description: "Findings or sections to prioritize", required: false },
    ],
  },
];

export function listPrompts(): PromptDefinition[] {
  return DEFINITIONS.map((definition) => ({
    ...definition,
    arguments: definition.arguments.map((argument) => ({ ...argument })),
  }));
}

export async function getPrompt(
  name: string,
  variables: Record<string, string | undefined> = {},
): Promise<{ definition: PromptDefinition; text: string }> {
  const definition = DEFINITIONS.find((item) => item.name === name);
  if (!definition) {
    throw new Error(
      `Unknown prompt '${name}'. Available prompts: ${DEFINITIONS.map((item) => item.name).join(", ")}.`,
    );
  }
  const body = await readFile(path.join(packageRoot(), "prompts", definition.file), "utf8");
  const supplied = definition.arguments
    .map((argument) => [argument.name, variables[argument.name]?.trim()] as const)
    .filter((entry): entry is readonly [string, string] => Boolean(entry[1]));
  const preface = supplied.length
    ? `## Invocation Context\n\n${supplied.map(([key, value]) => `- ${key}: ${value}`).join("\n")}\n\n`
    : "";
  return { definition: { ...definition }, text: `${preface}${body.trim()}\n` };
}
