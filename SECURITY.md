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
- It makes no network calls and has no telemetry.
- It does not evaluate Markdown or embedded diagram code.
- Remote images and image paths outside the project are rejected.
- Diagram export invokes a local executable selected by the user or discovered from known names.
- AI prompt files are documentation only; no model integration exists.

Review architecture content before providing it to any external service or model.
