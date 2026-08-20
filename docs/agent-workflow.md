# Agent Workflow

Architecture Workbench is a harness for collaboration, not an autonomous architect. The host agent
edits declared source files under the host's permission model; deterministic commands provide
context and gates; humans retain consequential approvals and publication.

## Lifecycle

1. **Discover:** capture decision audience, scope, `REQ` requirements, `ASM` assumptions, and
   evidence gaps. Do not turn an unstated preference into a requirement.
2. **Design:** describe context, domain, configuration, state ownership, trust boundaries, and major
   decisions. Keep uncertain claims as open assumptions.
3. **Specify:** define APIs, runtime sequences, operation states, retries, timeouts, cancellation,
   human intervention, and failure outcomes.
4. **Critique:** run deterministic validation and review, then use focused critique prompts. Record
   findings rather than silently smoothing over contradictions.
5. **Revise:** update canonical Markdown and draw.io source, preserve IDs, and connect evidence.
6. **Approve:** ask humans to accept or reject proposed decisions, accepted risks, and security
   exceptions. Agents do not write their own approval attribution.
7. **Publish:** run strict validation, diagram verification, and build. External distribution
   remains a human-owned action outside the CLI.

## Recommended Loop

```bash
archwork context --include-source --format json
archwork status --format json
archwork prompts show discover
archwork validate --strict --format json
archwork review --format json
archwork diagrams inspect --format json
archwork diagrams format
archwork diagrams verify --format json
archwork agent check-changes --base main --strict --format json
archwork build --format json
```

An agent should report the commands run, changed canonical files, unresolved diagnostics, evidence
gaps, and approvals needed. A green status means deterministic gates passed; it does not prove the
architecture is correct, secure, economical, or approved for deployment.

## End-To-End Scenario

1. The agent reads `AGENTS.md`, then requests `archwork context`.
2. `status` reports missing requirements, assumptions, runtime behavior, or approval gates.
3. The agent uses `prompts show discover` to conduct a bounded discovery interview.
4. The agent drafts source records and diagrams without accepting decisions or fabricating evidence.
5. The agent validates, reviews, and semantically inspects diagrams.
6. The agent revises the canonical files and runs `agent check-changes` against the review base.
7. A human approves consequential records and authorizes publication separately.
8. The agent verifies diagrams and builds the DOCX. It does not upload or distribute the artifact.
