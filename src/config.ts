import { readFile, realpath } from "node:fs/promises";
import path from "node:path";

import yaml from "js-yaml";
import { z } from "zod";

import { assertConfinedPattern, resolveConfinedPath } from "./paths.js";
import type { AgentPolicy, ArchitectureConfig, ResolvedArchitectureConfig } from "./types.js";

const DEFAULT_REQUIRED_SECTIONS = [
  "Executive Summary",
  "Scope and Audience",
  "Requirements and Assumptions",
  "Architecture Overview",
  "Runtime Flows",
  "API and Data Contracts",
  "Scalability and Resilience",
  "Security, Privacy, and Audit",
  "Human Escalation and Failure Handling",
  "Ownership and Operating Model",
  "Reference Deployment",
  "Architecture Decisions",
  "References",
];

const pageSchema = z
  .object({
    size: z.enum(["letter", "a4"]).default("letter"),
    orientation: z.enum(["portrait", "landscape"]).default("portrait"),
    marginInches: z.number().min(0.4).max(2).default(1),
  })
  .default({ size: "letter", orientation: "portrait", marginInches: 1 });

const tocSchema = z
  .object({
    mode: z.enum(["static", "field"]).default("static"),
    depth: z.union([z.literal(2), z.literal(3), z.literal(4)]).default(2),
  })
  .default({ mode: "static", depth: 2 });

const agentSchema = z.object({
  instructions: z.string().min(1).default("AGENTS.md"),
  editablePaths: z
    .array(z.string().min(1))
    .default(["architecture.yaml", "architecture.md", "AGENTS.md", "diagrams/**/*.drawio"]),
  generatedPaths: z
    .array(z.string().min(1))
    .default(["diagrams/rendered/**/*.png", "dist/**/*.docx"]),
  approvalGates: z
    .array(
      z.enum([
        "decision-acceptance",
        "risk-acceptance",
        "security-exception",
        "external-publication",
      ]),
    )
    .default([
      "decision-acceptance",
      "risk-acceptance",
      "security-exception",
      "external-publication",
    ]),
});

const configSchema = z.object({
  schemaVersion: z.literal(1),
  document: z.object({
    title: z.string().min(1),
    author: z.string().min(1),
    subject: z.string().min(1).optional(),
    keywords: z.array(z.string().min(1)).default([]),
    source: z.string().min(1).default("architecture.md"),
    output: z.string().min(1).default("dist/architecture.docx"),
    page: pageSchema,
    toc: tocSchema,
    requireExplicitNumbering: z.boolean().default(true),
  }),
  diagrams: z
    .object({
      sourceDir: z.string().min(1).default("diagrams"),
      renderedDir: z.string().min(1).default("diagrams/rendered"),
      embedSource: z.boolean().default(true),
    })
    .default({
      sourceDir: "diagrams",
      renderedDir: "diagrams/rendered",
      embedSource: true,
    }),
  quality: z
    .object({
      profile: z.literal("service").default("service"),
      requiredSections: z.array(z.string().min(1)).default(DEFAULT_REQUIRED_SECTIONS),
      forbiddenPatterns: z.array(z.string()).default([]),
    })
    .default({
      profile: "service",
      requiredSections: DEFAULT_REQUIRED_SECTIONS,
      forbiddenPatterns: [],
    }),
  agent: agentSchema.optional(),
});

export class ConfigurationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "ConfigurationError";
  }
}

export async function loadConfig(
  configFile = "architecture.yaml",
): Promise<ResolvedArchitectureConfig> {
  const requestedConfigPath = path.resolve(configFile);
  let raw: string;
  try {
    raw = await readFile(requestedConfigPath, "utf8");
  } catch (error) {
    throw new ConfigurationError(
      `Cannot read configuration at ${requestedConfigPath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const configPath = await realpath(requestedConfigPath);

  let input: unknown;
  try {
    input = yaml.load(raw);
  } catch (error) {
    throw new ConfigurationError(
      `Invalid YAML in ${configPath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const result = configSchema.safeParse(input);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join(".") || "configuration"}: ${issue.message}`)
      .join("; ");
    throw new ConfigurationError(`Invalid architecture configuration: ${details}`);
  }

  const config: ArchitectureConfig = result.data;
  const projectDir = path.dirname(configPath);
  let sourcePath: string;
  let outputPath: string;
  let diagramSourcePath: string;
  let diagramRenderedPath: string;
  try {
    sourcePath = await resolveConfinedPath(projectDir, config.document.source);
    outputPath = await resolveConfinedPath(projectDir, config.document.output);
    diagramSourcePath = await resolveConfinedPath(projectDir, config.diagrams.sourceDir);
    diagramRenderedPath = await resolveConfinedPath(projectDir, config.diagrams.renderedDir);
    const policy = effectiveAgentPolicy(config);
    await resolveConfinedPath(projectDir, policy.instructions);
    for (const pattern of [...policy.editablePaths, ...policy.generatedPaths]) {
      assertConfinedPattern(pattern);
    }
  } catch (error) {
    throw new ConfigurationError(
      `Invalid project path: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return {
    ...config,
    configPath,
    projectDir,
    sourcePath,
    outputPath,
    diagramSourcePath,
    diagramRenderedPath,
  };
}

export function defaultRequiredSections(): string[] {
  return [...DEFAULT_REQUIRED_SECTIONS];
}

export function effectiveAgentPolicy(config: ArchitectureConfig): AgentPolicy {
  return (
    config.agent ?? {
      instructions: "AGENTS.md",
      editablePaths: ["architecture.yaml", "architecture.md", "AGENTS.md", "diagrams/**/*.drawio"],
      generatedPaths: ["diagrams/rendered/**/*.png", "dist/**/*.docx"],
      approvalGates: [
        "decision-acceptance",
        "risk-acceptance",
        "security-exception",
        "external-publication",
      ],
    }
  );
}
