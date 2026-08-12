#!/usr/bin/env node

import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import { Command } from "commander";

import { loadConfig } from "./config.js";
import { exportDiagrams, verifyDiagrams } from "./diagrams.js";
import { writeDocx } from "./docx.js";
import { parseArchitecture } from "./markdown.js";
import { formatDiagnostics, formatReview, hasErrors } from "./output.js";
import { collectDiagramSources, initializeProject } from "./project.js";
import { reviewArchitecture } from "./review.js";
import { validateDocx, validateProject } from "./validation.js";

type CommonOptions = {
  config: string;
};

type ValidateOptions = CommonOptions & {
  strict: boolean;
  format: "text" | "json";
};

async function outputExists(file: string): Promise<boolean> {
  try {
    return (await stat(file)).isFile();
  } catch {
    return false;
  }
}

async function loadProject(configFile: string) {
  const config = await loadConfig(configFile);
  const markdown = await readFile(config.sourcePath, "utf8");
  return { config, parsed: parseArchitecture(markdown) };
}

function fail(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`archwork: ${message}\n`);
  process.exitCode = 1;
}

const program = new Command();
program
  .name("archwork")
  .description("Architecture-as-code tooling for Markdown, draw.io, and DOCX workflows.")
  .version("0.1.0");

program
  .command("init")
  .description("Create a new architecture project from a reusable template.")
  .argument("<directory>", "Destination directory")
  .option("--template <name>", "Template name", "service")
  .option("--force", "Merge into a non-empty directory", false)
  .action(async (directory: string, options: { template: string; force: boolean }) => {
    try {
      const target = await initializeProject(directory, options.template, options.force);
      process.stdout.write(`Initialized architecture project at ${target}\n`);
      process.stdout.write(
        `Next: archwork validate --config ${path.join(target, "architecture.yaml")}\n`,
      );
    } catch (error) {
      fail(error);
    }
  });

program
  .command("build")
  .description("Validate Markdown and build a polished DOCX artifact.")
  .option("--config <path>", "Architecture configuration", "architecture.yaml")
  .action(async (options: CommonOptions) => {
    try {
      const { config, parsed } = await loadProject(options.config);
      const diagnostics = await validateProject(parsed, config, false);
      process.stdout.write(`${formatDiagnostics(diagnostics, "text")}\n`);
      if (hasErrors(diagnostics)) {
        process.exitCode = 1;
        return;
      }
      const output = await writeDocx(parsed, config);
      const docxDiagnostics = await validateDocx(output, config);
      if (docxDiagnostics.length > 0) {
        process.stdout.write(`${formatDiagnostics(docxDiagnostics, "text")}\n`);
      }
      if (hasErrors(docxDiagnostics)) {
        process.exitCode = 1;
        return;
      }
      process.stdout.write(`Built ${output}\n`);
    } catch (error) {
      fail(error);
    }
  });

program
  .command("validate")
  .description("Check project structure, Markdown, diagrams, and an existing DOCX artifact.")
  .option("--config <path>", "Architecture configuration", "architecture.yaml")
  .option("--strict", "Promote warnings to errors", false)
  .option("--format <format>", "Output format: text or json", "text")
  .action(async (options: ValidateOptions) => {
    try {
      if (!new Set(["text", "json"]).has(options.format)) {
        throw new Error("--format must be text or json");
      }
      const { config, parsed } = await loadProject(options.config);
      const diagnostics = await validateProject(parsed, config, options.strict);
      if (await outputExists(config.outputPath)) {
        diagnostics.push(...(await validateDocx(config.outputPath, config)));
      }
      process.stdout.write(`${formatDiagnostics(diagnostics, options.format)}\n`);
      if (hasErrors(diagnostics)) process.exitCode = 1;
    } catch (error) {
      fail(error);
    }
  });

program
  .command("review")
  .description("Score deterministic architecture coverage and suggest missing views.")
  .option("--config <path>", "Architecture configuration", "architecture.yaml")
  .option("--format <format>", "Output format: text or json", "text")
  .action(async (options: CommonOptions & { format: "text" | "json" }) => {
    try {
      if (!new Set(["text", "json"]).has(options.format)) {
        throw new Error("--format must be text or json");
      }
      const { config, parsed } = await loadProject(options.config);
      const diagrams = await collectDiagramSources(config.diagramSourcePath);
      process.stdout.write(
        `${formatReview(reviewArchitecture(parsed, diagrams), options.format)}\n`,
      );
    } catch (error) {
      fail(error);
    }
  });

const diagrams = program
  .command("diagrams")
  .description("Manage editable draw.io sources and PNG previews.");

diagrams
  .command("verify")
  .description("Verify source/preview pairing and embedded source hashes.")
  .option("--config <path>", "Architecture configuration", "architecture.yaml")
  .action(async (options: CommonOptions) => {
    try {
      const config = await loadConfig(options.config);
      const diagnostics = await verifyDiagrams(config);
      process.stdout.write(`${formatDiagnostics(diagnostics, "text")}\n`);
      if (hasErrors(diagnostics)) process.exitCode = 1;
    } catch (error) {
      fail(error);
    }
  });

diagrams
  .command("export")
  .description("Export all draw.io sources to PNG and embed editable metadata.")
  .option("--config <path>", "Architecture configuration", "architecture.yaml")
  .option("--drawio-bin <path>", "Path or command for the diagrams.net executable")
  .action(async (options: CommonOptions & { drawioBin?: string }) => {
    try {
      const config = await loadConfig(options.config);
      const files = await exportDiagrams(config, options.drawioBin);
      process.stdout.write(
        `Exported ${files.length} diagram preview${files.length === 1 ? "" : "s"}.\n`,
      );
    } catch (error) {
      fail(error);
    }
  });

await program.parseAsync(process.argv);
