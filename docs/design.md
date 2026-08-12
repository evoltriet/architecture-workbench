# Framework Design

Architecture Workbench separates authoring concerns so each artifact has one responsibility.

## Source Model

`architecture.yaml` defines portable paths and policy. `architecture.md` contains reviewable
content. The Markdown parser produces a small block and inline model independent of Word.

## Diagram Model

Editable source and portable preview are intentionally separate. PNG metadata binds them without
making Word the source of truth. Verification uses content hashes rather than timestamps, so clones
and archive extraction remain deterministic.

## Document Model

The DOCX renderer maps parsed blocks to native Word elements. The package validator then inspects
the ZIP parts, XML, relationships, heading styles, bookmarks, tables, images, content types, and alt
text. Generated documents are outputs, not authoring inputs.

## Quality Model

Validation reports objective structural problems. Strict mode promotes warnings when CI requires a
complete template. Review scoring reports architecture coverage separately and never mutates source.

## Security Model

The CLI is local-only, has no telemetry, does not evaluate document code, rejects remote images, and
does not invoke an LLM. The optional exporter invokes only an explicitly configured or discovered
local diagrams.net executable.
