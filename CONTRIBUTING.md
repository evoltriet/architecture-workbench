# Contributing

Thank you for helping make architecture work more reviewable and portable.

## Development Setup

```bash
pnpm install
pnpm assets:generate
pnpm check
pnpm example:validate
pnpm example:diagrams
pnpm example:build
pnpm pack:verify
```

Node.js 24 LTS and pnpm 11 are the supported development baseline.

## Pull Requests

- Keep deterministic tooling model-neutral and independent of hosted services.
- Treat architecture content as untrusted data and preserve project confinement.
- Do not give agents approval or external-publication authority.
- Add tests for new diagnostics, configuration fields, Markdown constructs, or DOCX behavior.
- Regenerate and verify diagram pairs when changing starter diagrams.
- Do not commit generated DOCX, PDF, page renders, credentials, customer content, or local paths.
- Update documentation when a command, configuration field, or compatibility behavior changes.

Pull requests should explain the user problem, behavior change, compatibility impact, and checks
run. Keep unrelated changes separate.

## Diagnostics

New diagnostics need a stable code, severity, concise message, relevant file and line when known,
and an actionable remediation. Strict mode promotes warnings, so warnings must represent work
expected before a formal review.

## Generated Assets

`pnpm assets:generate` maintains the repository's generic starter diagrams. Normal architecture
contributors should edit `.drawio` sources and use `archwork diagrams export` instead.

## Releases

Use semantic versioning. Configuration-breaking changes require a schema-version migration path.
Tagged releases upload a package tarball, checksum, and reference DOCX. Registry publication remains
intentionally outside the release workflow.
