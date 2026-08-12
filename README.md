# Architecture Workbench

Architecture Workbench is an architecture-as-code toolkit for teams that need reviewable Markdown,
editable diagrams, and polished Word deliverables without maintaining three disconnected sources of
truth.

The `archwork` CLI scaffolds a behavioral architecture, validates its coverage, proves that draw.io
previews match their editable sources, and builds a deterministic DOCX with native headings,
bookmarks, hyperlinks, tables, captions, and embedded diagrams.

## Why This Exists

Architecture documents often become deployment inventories with diagrams that cannot be edited,
assumptions that cannot be recalculated, and Word files that cannot be reviewed meaningfully in Git.
This project makes the workflow explicit:

1. Write and review architecture content in Markdown.
2. Keep each diagram as an editable `.drawio` source and committed PNG preview.
3. Validate behavioral, operational, security, and ownership coverage.
4. Generate a polished DOCX for broad distribution.
5. Treat generated documents as CI or release artifacts rather than opaque source files.

## Requirements

- Node.js 24 LTS or newer
- pnpm 11 or newer
- Optional: the [diagrams.net desktop application](https://www.diagrams.net/) for re-exporting
  diagram previews
- Optional: LibreOffice and Poppler for local visual QA

The normal build does not require diagrams.net because matching PNG previews are committed with the
editable sources.

## Quick Start

Clone and build the CLI:

```bash
pnpm install
pnpm check
pnpm link --global
```

Create and build an architecture project:

```bash
archwork init my-service --template service
cd my-service
archwork validate --strict
archwork review
archwork build
```

The generated DOCX is written to the path configured by `document.output` in `architecture.yaml`.

To try the complete reference project without installing the global command:

```bash
pnpm example:diagrams
pnpm example:validate
pnpm example:review
pnpm example:build
```

## Commands

| Command                                        | Purpose                                                    |
| ---------------------------------------------- | ---------------------------------------------------------- |
| `archwork init <directory> --template service` | Scaffold a complete architecture project                   |
| `archwork build --config <path>`               | Validate source, generate DOCX, and validate the package   |
| `archwork validate --strict --format text`     | Check source, structure, diagrams, and existing DOCX       |
| `archwork review --format text`                | Score deterministic architecture coverage and suggest gaps |
| `archwork diagrams verify`                     | Prove that each PNG matches its `.drawio` source           |
| `archwork diagrams export`                     | Re-export PNG previews and embed editable source metadata  |

All commands resolve source, output, and diagram paths relative to the configuration file. No
workspace-specific absolute path is required.

## Project Layout

```text
architecture.yaml
architecture.md
diagrams/
  system-context.drawio
  rendered/
    system-context.png
dist/
  architecture.docx
```

The PNG is the preview embedded in Word. The `.drawio` file is the collaboration source. The PNG
also carries the complete draw.io XML and its SHA-256 hash as metadata, allowing CI to detect stale
exports and allowing diagrams.net to recover editable content from the image.

## Configuration

`architecture.yaml` is the stable project contract:

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
quality:
  profile: service
  requiredSections:
    - Executive Summary
  forbiddenPatterns: []
```

The default static TOC contains internal links to main sections and behaves consistently in Word and
Google Docs imports. `mode: field` emits a native Word TOC field for teams that prioritize Word's
page-number updates over file-preview compatibility.

## Architecture Coverage

The service template deliberately extends beyond component and deployment views. It prompts for:

- audience, scope, requirements, assumptions, capacity, and constraints
- system context, domain entities, configuration, and state ownership
- happy path, rejection, runtime failure, state transitions, and lifecycle hooks
- external and internal APIs, events, idempotency, cancellation, resume, and override
- scaling planes, backpressure, retry policy, isolation, retention, and recovery
- security boundaries, data minimization, identity, encryption, audit, and evidence
- human escalation, operator experience, ownership, deployment, and decisions

`archwork review` is deterministic. It reports evidence and gaps but does not call an LLM or send
document content to an external service.

## Documentation

- [Authoring workflow](docs/authoring-workflow.md)
- [Diagram collaboration](docs/diagram-workflow.md)
- [DOCX and Google Drive compatibility](docs/docx-compatibility.md)
- [Review rubric](docs/review-rubric.md)
- [Extending the framework](docs/extending.md)
- [Framework design](docs/design.md)
- [Troubleshooting](docs/troubleshooting.md)
- [AI-assisted prompt pack](prompts/README.md)

## Security And Privacy

The CLI operates on local files, has no telemetry, and makes no network calls. Diagram export starts
only a locally installed diagrams.net executable. Architecture content is never sent to an LLM by
the tool. See [SECURITY.md](SECURITY.md) for vulnerability reporting and supported versions.

## Contributing

Contributions are welcome. Run `pnpm check`, rebuild the reference example, and read
[CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

## License

Licensed under the [Apache License 2.0](LICENSE).
