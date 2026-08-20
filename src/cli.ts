#!/usr/bin/env node

import { stat } from "node:fs/promises";
import path from "node:path";

import { Command } from "commander";

import {
  exportDiagrams,
  formatDrawioSources,
  inspectDiagrams,
  verifyDiagrams,
} from "./diagrams.js";
import { writeDocx } from "./docx.js";
import { startMcpServer } from "./mcp.js";
import {
  createEnvelope,
  createStandaloneEnvelope,
  formatContext,
  formatDiagnostics,
  formatEnvelope,
  formatReview,
  formatStatus,
  hasErrors,
} from "./output.js";
import { checkAgentChanges } from "./policy.js";
import { initializeProject } from "./project.js";
import { getPrompt, listPrompts } from "./prompts.js";
import { loadArchitectureContext, loadArchitectureStatus, loadProject } from "./runtime.js";
import type { Diagnostic } from "./types.js";
import { validateDocx, validateProject } from "./validation.js";

type OutputFormat = "text" | "json";
type CommonOptions = { config: string };
type FormattedOptions = CommonOptions & { format: OutputFormat };

const EXIT_VALIDATION = 1;
const EXIT_USAGE = 2;
const EXIT_TOOLING = 3;

function relative(configRoot: string, target: string): string {
  return path.relative(configRoot, target).replaceAll("\\", "/") || ".";
}

function assertFormat(format: string): asserts format is OutputFormat {
  if (!new Set(["text", "json"]).has(format)) throw new Error("--format must be text or json");
}

async function outputExists(file: string): Promise<boolean> {
  try {
    return (await stat(file)).isFile();
  } catch {
    return false;
  }
}

function fail(
  error: unknown,
  exitCode = EXIT_USAGE,
  format?: OutputFormat,
  command = "error",
): void {
  const rawMessage = error instanceof Error ? error.message : String(error);
  const message = rawMessage.replaceAll(process.cwd(), ".");
  if (format === "json") {
    const diagnostic: Diagnostic = {
      code: exitCode === EXIT_TOOLING ? "tool.unavailable" : "command.invalid",
      severity: "error",
      message,
    };
    process.stdout.write(
      `${formatEnvelope(createStandaloneEnvelope(command, {}, [diagnostic]))}\n`,
    );
  } else {
    process.stderr.write(`archwork: ${message}\n`);
  }
  process.exitCode = exitCode;
}

function writeDiagnosticsOrEnvelope(
  command: string,
  format: OutputFormat,
  project: Awaited<ReturnType<typeof loadProject>>,
  data: unknown,
  diagnostics: Diagnostic[],
): void {
  const output =
    format === "json"
      ? formatEnvelope(createEnvelope(command, project.config, data, diagnostics))
      : formatDiagnostics(diagnostics, "text");
  process.stdout.write(`${output}\n`);
  if (hasErrors(diagnostics)) process.exitCode = EXIT_VALIDATION;
}

const program = new Command();
program
  .name("archwork")
  .description(
    "Agent-ready architecture-as-code tooling for Markdown, draw.io, and DOCX workflows.",
  )
  .version("0.2.0");

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
        `Next: archwork context --config ${path.join(target, "architecture.yaml")}\n`,
      );
    } catch (error) {
      fail(error);
    }
  });

program
  .command("context")
  .description("Return agent-ready project context, records, diagrams, policy, and coverage.")
  .option("--config <path>", "Architecture configuration", "architecture.yaml")
  .option("--include-source", "Include full Markdown source", false)
  .option("--format <format>", "Output format: text or json", "text")
  .action(async (options: FormattedOptions & { includeSource: boolean }) => {
    try {
      assertFormat(options.format);
      const result = await loadArchitectureContext(options.config, options.includeSource);
      if (options.format === "json") {
        process.stdout.write(
          `${formatEnvelope(createEnvelope("context", result.config, result.context, result.diagnostics))}\n`,
        );
      } else {
        process.stdout.write(`${formatContext(result.context)}\n`);
        if (result.diagnostics.length > 0) {
          process.stdout.write(`\n${formatDiagnostics(result.diagnostics, "text")}\n`);
        }
      }
      if (hasErrors(result.diagnostics)) process.exitCode = EXIT_VALIDATION;
    } catch (error) {
      fail(error, EXIT_USAGE, options.format, "context");
    }
  });

program
  .command("status")
  .description("Compute deterministic lifecycle readiness and next actions.")
  .option("--config <path>", "Architecture configuration", "architecture.yaml")
  .option("--format <format>", "Output format: text or json", "text")
  .action(async (options: FormattedOptions) => {
    try {
      assertFormat(options.format);
      const result = await loadArchitectureStatus(options.config);
      const output =
        options.format === "json"
          ? formatEnvelope(
              createEnvelope("status", result.config, result.status, result.diagnostics),
            )
          : formatStatus(result.status);
      process.stdout.write(`${output}\n`);
      if (hasErrors(result.diagnostics)) process.exitCode = EXIT_VALIDATION;
    } catch (error) {
      fail(error, EXIT_USAGE, options.format, "status");
    }
  });

program
  .command("build")
  .description("Validate Markdown and build a polished DOCX artifact.")
  .option("--config <path>", "Architecture configuration", "architecture.yaml")
  .option("--format <format>", "Output format: text or json", "text")
  .action(async (options: FormattedOptions) => {
    try {
      assertFormat(options.format);
      const project = await loadProject(options.config);
      const diagnostics = await validateProject(project.parsed, project.config, false);
      let output: string | undefined;
      if (!hasErrors(diagnostics)) {
        output = await writeDocx(project.parsed, project.config);
        diagnostics.push(...(await validateDocx(output, project.config)));
      }
      if (options.format === "json") {
        process.stdout.write(
          `${formatEnvelope(
            createEnvelope(
              "build",
              project.config,
              { ...(output ? { output: relative(project.config.projectDir, output) } : {}) },
              diagnostics,
            ),
          )}\n`,
        );
      } else {
        process.stdout.write(`${formatDiagnostics(diagnostics, "text")}\n`);
        if (output && !hasErrors(diagnostics)) process.stdout.write(`Built ${output}\n`);
      }
      if (hasErrors(diagnostics)) process.exitCode = EXIT_VALIDATION;
    } catch (error) {
      fail(error, EXIT_USAGE, options.format, "build");
    }
  });

program
  .command("validate")
  .description("Check project structure, Markdown, diagrams, and an existing DOCX artifact.")
  .option("--config <path>", "Architecture configuration", "architecture.yaml")
  .option("--strict", "Promote warnings to errors", false)
  .option("--format <format>", "Output format: text or json", "text")
  .action(async (options: FormattedOptions & { strict: boolean }) => {
    try {
      assertFormat(options.format);
      const project = await loadProject(options.config);
      const diagnostics = await validateProject(project.parsed, project.config, options.strict);
      if (await outputExists(project.config.outputPath)) {
        diagnostics.push(...(await validateDocx(project.config.outputPath, project.config)));
      }
      writeDiagnosticsOrEnvelope(
        "validate",
        options.format,
        project,
        { strict: options.strict },
        diagnostics,
      );
    } catch (error) {
      fail(error, EXIT_USAGE, options.format, "validate");
    }
  });

program
  .command("review")
  .description("Score deterministic architecture coverage and suggest missing views.")
  .option("--config <path>", "Architecture configuration", "architecture.yaml")
  .option("--format <format>", "Output format: text or json", "text")
  .action(async (options: FormattedOptions) => {
    try {
      assertFormat(options.format);
      const result = await loadArchitectureContext(options.config, false);
      const output =
        options.format === "json"
          ? formatEnvelope(
              createEnvelope("review", result.config, result.context.review, result.diagnostics),
            )
          : formatReview(result.context.review, "text");
      process.stdout.write(`${output}\n`);
      if (hasErrors(result.diagnostics)) process.exitCode = EXIT_VALIDATION;
    } catch (error) {
      fail(error, EXIT_USAGE, options.format, "review");
    }
  });

const prompts = program.command("prompts").description("List and read reusable agent prompts.");

prompts
  .command("list")
  .option("--format <format>", "Output format: text or json", "text")
  .action((options: { format: OutputFormat }) => {
    try {
      assertFormat(options.format);
      const definitions = listPrompts();
      const output =
        options.format === "json"
          ? formatEnvelope(createStandaloneEnvelope("prompts.list", definitions))
          : definitions.map((item) => `${item.name}: ${item.description}`).join("\n");
      process.stdout.write(`${output}\n`);
    } catch (error) {
      fail(error, EXIT_USAGE, options.format, "prompts.list");
    }
  });

prompts
  .command("show")
  .argument("<name>", "Prompt name")
  .option("--format <format>", "Output format: text or json", "text")
  .action(async (name: string, options: { format: OutputFormat }) => {
    try {
      assertFormat(options.format);
      const prompt = await getPrompt(name);
      const output =
        options.format === "json"
          ? formatEnvelope(createStandaloneEnvelope("prompts.show", prompt))
          : prompt.text;
      process.stdout.write(`${output}\n`);
    } catch (error) {
      fail(error, EXIT_USAGE, options.format, "prompts.show");
    }
  });

const agent = program.command("agent").description("Check agent workspace policy and approvals.");

agent
  .command("check-changes")
  .requiredOption("--base <git-ref>", "Git revision used as the comparison base")
  .option("--config <path>", "Architecture configuration", "architecture.yaml")
  .option("--strict", "Promote policy warnings to errors", false)
  .option("--format <format>", "Output format: text or json", "text")
  .action(async (options: FormattedOptions & { base: string; strict: boolean }) => {
    try {
      assertFormat(options.format);
      const project = await loadProject(options.config);
      const result = checkAgentChanges(
        project.config,
        project.parsed,
        options.base,
        options.strict,
      );
      if (options.format === "json") {
        process.stdout.write(
          `${formatEnvelope(createEnvelope("agent.check-changes", project.config, result.report, result.diagnostics))}\n`,
        );
      } else {
        const summary = result.report.files
          .map((file) => `${file.classification.toUpperCase()} ${file.path}`)
          .join("\n");
        if (summary) process.stdout.write(`${summary}\n\n`);
        process.stdout.write(`${formatDiagnostics(result.diagnostics, "text")}\n`);
      }
      if (hasErrors(result.diagnostics)) process.exitCode = EXIT_VALIDATION;
    } catch (error) {
      fail(error, EXIT_USAGE, options.format, "agent.check-changes");
    }
  });

const diagrams = program.command("diagrams").description("Manage editable draw.io sources.");

diagrams
  .command("verify")
  .option("--config <path>", "Architecture configuration", "architecture.yaml")
  .option("--format <format>", "Output format: text or json", "text")
  .action(async (options: FormattedOptions) => {
    try {
      assertFormat(options.format);
      const project = await loadProject(options.config);
      const diagnostics = await verifyDiagrams(project.config);
      writeDiagnosticsOrEnvelope("diagrams.verify", options.format, project, {}, diagnostics);
    } catch (error) {
      fail(error, EXIT_USAGE, options.format, "diagrams.verify");
    }
  });

diagrams
  .command("inspect")
  .option("--config <path>", "Architecture configuration", "architecture.yaml")
  .option("--format <format>", "Output format: text or json", "text")
  .action(async (options: FormattedOptions) => {
    try {
      assertFormat(options.format);
      const project = await loadProject(options.config);
      const result = await inspectDiagrams(project.config);
      if (options.format === "json") {
        process.stdout.write(
          `${formatEnvelope(createEnvelope("diagrams.inspect", project.config, result.diagrams, result.diagnostics))}\n`,
        );
      } else {
        for (const diagram of result.diagrams) {
          process.stdout.write(
            `${diagram.name}: ${diagram.pages.length} page(s), ${diagram.nodes.length} node(s), ${diagram.edges.length} edge(s)\n`,
          );
        }
        if (result.diagnostics.length > 0) {
          process.stdout.write(`\n${formatDiagnostics(result.diagnostics, "text")}\n`);
        }
      }
      if (hasErrors(result.diagnostics)) process.exitCode = EXIT_VALIDATION;
    } catch (error) {
      fail(error, EXIT_USAGE, options.format, "diagrams.inspect");
    }
  });

diagrams
  .command("format")
  .description("Canonicalize draw.io XML for stable diffs and agent editing.")
  .option("--config <path>", "Architecture configuration", "architecture.yaml")
  .action(async (options: CommonOptions) => {
    try {
      const project = await loadProject(options.config);
      const files = await formatDrawioSources(project.config);
      process.stdout.write(
        `Formatted ${files.length} draw.io source${files.length === 1 ? "" : "s"}.\n`,
      );
    } catch (error) {
      fail(error);
    }
  });

diagrams
  .command("export")
  .option("--config <path>", "Architecture configuration", "architecture.yaml")
  .option("--drawio-bin <path>", "Path or command for the diagrams.net executable")
  .option("--format <format>", "Output format: text or json", "text")
  .action(async (options: FormattedOptions & { drawioBin?: string }) => {
    try {
      assertFormat(options.format);
      const project = await loadProject(options.config);
      const files = await exportDiagrams(project.config, options.drawioBin);
      const relativeFiles = files.map((file) => relative(project.config.projectDir, file)).sort();
      if (options.format === "json") {
        process.stdout.write(
          `${formatEnvelope(createEnvelope("diagrams.export", project.config, { files: relativeFiles }, []))}\n`,
        );
      } else {
        process.stdout.write(
          `Exported ${files.length} diagram preview${files.length === 1 ? "" : "s"}.\n`,
        );
      }
    } catch (error) {
      fail(error, EXIT_TOOLING, options.format, "diagrams.export");
    }
  });

program
  .command("mcp")
  .description("Run the local Architecture Workbench MCP server over stdio.")
  .option("--config <path>", "Architecture configuration", "architecture.yaml")
  .action(async (options: CommonOptions) => {
    try {
      await startMcpServer(options.config);
    } catch (error) {
      fail(error);
    }
  });

await program.parseAsync(process.argv);
