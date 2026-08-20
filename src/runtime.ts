import { readFile } from "node:fs/promises";

import { loadConfig } from "./config.js";
import { createArchitectureContext, createArchitectureStatus } from "./context.js";
import { parseArchitecture } from "./markdown.js";
import type {
  ArchitectureContext,
  ArchitectureStatus,
  Diagnostic,
  ParsedArchitecture,
  ResolvedArchitectureConfig,
} from "./types.js";
import { validateProject } from "./validation.js";

export type LoadedProject = {
  config: ResolvedArchitectureConfig;
  parsed: ParsedArchitecture;
};

export async function loadProject(configFile: string): Promise<LoadedProject> {
  const config = await loadConfig(configFile);
  const markdown = await readFile(config.sourcePath, "utf8");
  return { config, parsed: parseArchitecture(markdown) };
}

export async function loadArchitectureContext(
  configFile: string,
  includeSource = false,
): Promise<LoadedProject & { context: ArchitectureContext; diagnostics: Diagnostic[] }> {
  const project = await loadProject(configFile);
  const result = await createArchitectureContext(project.parsed, project.config, includeSource);
  return { ...project, ...result };
}

export async function loadArchitectureStatus(configFile: string): Promise<
  LoadedProject & {
    context: ArchitectureContext;
    status: ArchitectureStatus;
    diagnostics: Diagnostic[];
  }
> {
  const result = await loadArchitectureContext(configFile, false);
  const strictDiagnostics = await validateProject(result.parsed, result.config, true);
  return {
    ...result,
    status: createArchitectureStatus(
      result.parsed,
      result.context,
      result.diagnostics,
      strictDiagnostics,
    ),
  };
}
