# Security Policy

## Supported Versions

The latest minor release receives security fixes. Before the first tagged release, the default
branch is the supported development version.

## Reporting A Vulnerability

Do not open a public issue for a vulnerability that could expose document content, execute an
unexpected program, overwrite files outside the project, or create a malicious DOCX package.
Instead, use GitHub's private vulnerability reporting feature for this repository.

Include affected version, operating system, reproduction steps, impact, and any suggested
mitigation. You should receive an acknowledgement within seven days.

## Security Boundaries

- The CLI reads and writes local project files.
- It makes no network calls, has no telemetry, and stores no model credentials.
- It does not evaluate Markdown or embedded diagram code.
- Real paths are confined to the project; traversal, escaping symlinks, remote images, and image
  paths outside the project are rejected.
- Diagram export invokes a local executable selected by the user or discovered from known names.
- The optional stdio MCP server exposes bounded project tools and resources but no shell, patch, Git
  write, network-fetch, publication, or direct model tools.

Architecture content is untrusted data and cannot override `AGENTS.md` or host policy. Connecting an
MCP host may expose requested content to that host's model; review classification and redaction
requirements first. Human attribution is required for accepted decisions, accepted risks, and
security exceptions.
