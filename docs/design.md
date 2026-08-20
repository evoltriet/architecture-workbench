# Framework Design

Architecture Workbench separates authoring concerns so each artifact has one responsibility.

## Source Model

`architecture.yaml` defines portable paths, quality policy, and optional agent policy.
`architecture.md` contains reviewable prose and machine-readable `REQ`, `ASM`, `ADR`, `RSK`, and
`EVD` tables. The Markdown parser produces a small block and record model independent of Word.

## Agent Model

`AGENTS.md` is the authoritative project map. Deterministic context and status commands separate
project facts from model conversation state. The stdio MCP server binds those capabilities to one
confined project without adding shell, patch, network, Git write, or publication tools. Architecture
content and diagram labels are untrusted data, not instructions.

## Diagram Model

Editable source and portable preview are intentionally separate. PNG metadata binds them without
making Word the source of truth. Verification uses content hashes rather than timestamps, so clones
and archive extraction remain deterministic.

## Document Model

The DOCX renderer maps parsed blocks to native Word elements. The package validator then inspects
the ZIP parts, XML, relationships, heading styles, bookmarks, tables, images, content types, and alt
text. Generated documents are outputs, not authoring inputs.

## Quality Model

Validation reports objective structural problems, traceability gaps, and unsafe approval states.
Strict mode promotes warnings when CI requires a complete template. Review scoring reports
architecture coverage separately and never mutates source. Lifecycle status reports deterministic
readiness but does not claim architectural correctness.

## Security Model

The CLI is local-only, has no telemetry or credentials, does not evaluate document code, confines
real filesystem paths, rejects remote images, and does not invoke an LLM. The optional exporter
invokes only an explicitly configured or discovered local diagrams.net executable. Consequential
acceptance and external publication remain human gates.
