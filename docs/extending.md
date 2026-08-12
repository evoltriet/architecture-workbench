# Extending Architecture Workbench

The project has five extension boundaries:

1. Configuration validation in `src/config.ts`.
2. Markdown block parsing in `src/markdown.ts`.
3. Word rendering in `src/docx.ts`.
4. Structural diagnostics in `src/validation.ts`.
5. Coverage dimensions in `src/review.ts`.

## Adding A Template

Create `templates/<name>` with `architecture.yaml`, `architecture.md`, and paired diagram assets.
Add the name to `initializeProject`, then add an integration test that scaffolds, strictly
validates, and builds it from a temporary directory.

## Adding A Quality Profile

Profiles should define required sections and review dimensions without changing document content.
Keep checks deterministic and provide a stable code, severity, file, line when available, and an
actionable remediation.

## Adding A DOCX Construct

Use native `docx-js` elements. Preserve fixed table widths, heading outline levels, image alt text,
and valid list numbering. Add package-level tests that inspect the generated XML plus a visual QA
example.

## Compatibility

Configuration uses `schemaVersion`. Additive optional fields can remain within version 1. Breaking
field semantics or path behavior requires a new schema version and a migration message.
