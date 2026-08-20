# Architecture Workbench

**An agent-ready architecture-as-code framework for humans and LLM agents to collaboratively
discover, design, review, and publish software architectures.**

Architecture Workbench keeps architecture work inspectable and portable: Markdown and editable
draw.io files are canonical, structured records make decisions traceable, deterministic quality
gates expose gaps, and polished DOCX files remain generated deliverables. Agents can use the CLI or
local MCP server without giving the framework model credentials or permission to publish.

## Why Agent Ready

An LLM can produce prose quickly, but a trustworthy architecture process also needs stable context,
bounded edit policy, evidence traceability, lifecycle gates, human approval, deterministic review,
and reproducible artifacts. Architecture Workbench supplies that harness while remaining
model-neutral and local-first.

The lifecycle is explicit:

```text
discover -> design -> specify -> critique -> revise -> approve -> publish
```

- `AGENTS.md` is the authoritative project map for Codex, GitHub Copilot, and compatible agents.
- `CLAUDE.md` imports that map for Claude Code.
- `archwork context` provides deterministic, machine-readable project context.
- `archwork status` reports readiness without claiming architectural correctness.
- `REQ`, `ASM`, `ADR`, `RSK`, and `EVD` tables preserve traceability and approval attribution.
- `archwork agent check-changes` checks edits against declared paths and approval-sensitive changes.
- `archwork mcp` exposes bounded tools, resources, and prompts over local stdio MCP.

Architecture content is **untrusted data**, not agent instructions. Agents may draft decisions,
risks, and exceptions, but only humans can accept them or authorize external publication.

## Requirements

- Node.js 24 LTS or newer
- pnpm 11 or newer
- Optional: [diagrams.net desktop](https://www.diagrams.net/) to re-export PNG previews
- Optional: LibreOffice and Poppler for local DOCX visual QA

Normal builds use committed, hash-matched PNG previews and do not require diagrams.net.

## Quick Start

```bash
pnpm install
pnpm build
pnpm link --global

archwork init my-service --template service
cd my-service
archwork context
archwork status
archwork validate --strict
archwork review
archwork diagrams verify
archwork build
```

The generated project contains `architecture.yaml`, `architecture.md`, `AGENTS.md`, `CLAUDE.md`,
editable `.drawio` files, and matching PNG previews. The DOCX output path is configured in
`architecture.yaml`.

To exercise the complete reference project from this repository:

```bash
pnpm example:context
pnpm example:status
pnpm example:validate
pnpm example:review
pnpm example:diagrams
pnpm example:build
```

## CLI

| Command                                        | Purpose                                                                     |
| ---------------------------------------------- | --------------------------------------------------------------------------- |
| `archwork init <directory> --template service` | Scaffold an agent-ready architecture project                                |
| `archwork context [--include-source]`          | Return paths, outline, records, diagrams, policy, diagnostics, and coverage |
| `archwork status`                              | Compute deterministic lifecycle and publication readiness                   |
| `archwork validate [--strict]`                 | Validate structure, records, paths, diagrams, and DOCX package              |
| `archwork review`                              | Report coverage gaps with stable codes and next actions                     |
| `archwork build`                               | Validate and generate a polished DOCX                                       |
| `archwork prompts list`                        | List model-neutral architecture prompts                                     |
| `archwork prompts show <name>`                 | Render a parameterized prompt for a host agent                              |
| `archwork agent check-changes --base <ref>`    | Check Git changes against edit and approval policy                          |
| `archwork diagrams inspect`                    | List diagram pages, nodes, edges, labels, and bounds                        |
| `archwork diagrams format`                     | Canonicalize draw.io XML and refresh embedded preview metadata              |
| `archwork diagrams verify`                     | Validate diagram XML and prove previews match sources                       |
| `archwork diagrams export`                     | Use local diagrams.net to re-render PNG previews                            |
| `archwork mcp`                                 | Start the project-bound local stdio MCP server                              |

Machine-oriented commands support `--format json` and return a stable envelope with schema version,
command, success state, relative project identity, data, and diagnostics. JSON omits timestamps,
absolute paths, and machine identity.

## Project Contract

`architecture.yaml` remains at `schemaVersion: 1`; the `agent` block is optional and backward
compatible:

```yaml
schemaVersion: 1
document:
  title: Service Architecture
  author: Architecture Team
  source: architecture.md
  output: dist/service-architecture.docx
  page:
    size: letter
    orientation: portrait
    marginInches: 1
  toc:
    mode: static
    depth: 2
  requireExplicitNumbering: true
diagrams:
  sourceDir: diagrams
  renderedDir: diagrams/rendered
  embedSource: true
agent:
  instructions: AGENTS.md
  editablePaths:
    - architecture.yaml
    - architecture.md
    - AGENTS.md
    - diagrams/**/*.drawio
  generatedPaths:
    - diagrams/rendered/**/*.png
    - dist/**/*.docx
  approvalGates:
    - decision-acceptance
    - risk-acceptance
    - security-exception
    - external-publication
quality:
  profile: service
  requiredSections:
    - Executive Summary
  forbiddenPatterns: []
```

Paths are resolved relative to the configuration file. Real-path checks reject traversal and
symlinks that escape the project root.

## MCP

`archwork mcp --config architecture.yaml` starts a local stdio server bound to one project. It
exposes context, status, validation, review, build, diagram inspection/verification, and change
policy checks; project resources; and parameterized architecture prompts. It does not expose shell,
patch, Git write, network fetch, publication, or direct LLM tools.

Connecting an MCP host may send architecture content to that host's configured model. Apply your
organization's data classification, redaction, model-use, and retention policies first. See
[MCP setup](docs/mcp-setup.md) and [agent safety](docs/agent-safety.md).

## Diagrams And DOCX

`.drawio` is the only canonical diagram format. `archwork diagrams format` creates stable multiline
XML for agent edits and Git review. PNG previews embed the complete draw.io XML and source SHA-256,
so stale exports are detectable and diagrams.net can recover editable source from a preview.

DOCX generation uses native headings, linked bookmarks, real Word tables, captions, alt text, page
numbers, and embedded PNG diagrams. Generated DOCX files are CI/release artifacts, not committed
source.

## Documentation

- [Agent workflow](docs/agent-workflow.md)
- [MCP setup and host integrations](docs/mcp-setup.md)
- [Architecture record schema](docs/record-schema.md)
- [Agent safety and governance](docs/agent-safety.md)
- [Evaluation framework](docs/evaluations.md)
- [Authoring workflow](docs/authoring-workflow.md)
- [Diagram collaboration](docs/diagram-workflow.md)
- [DOCX and Google Drive compatibility](docs/docx-compatibility.md)
- [Review rubric](docs/review-rubric.md)
- [Framework design](docs/design.md)
- [Extension points](docs/extending.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Prompt pack](prompts/README.md)

## Security And Privacy

The CLI has no telemetry, no model credentials, and no automatic network transmission. Diagram
export invokes only a locally configured diagrams.net executable. See [SECURITY.md](SECURITY.md) for
the supported release and vulnerability-reporting policy.

## Contributing And License

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) and run `pnpm check` before
opening a pull request. Architecture Workbench is licensed under the [Apache License 2.0](LICENSE).
