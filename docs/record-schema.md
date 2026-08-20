# Architecture Record Schema

Architecture records are ordinary Markdown tables and remain readable without the CLI. Column names
are stable and case-insensitive; IDs are unique across the document.

## Requirement

`REQ-###`: `ID | Requirement | Source | Owner | Verification | Status`

Statuses: `proposed`, `accepted`, `verified`, `retired`.

## Assumption

`ASM-###`: `ID | Assumption | Evidence Needed | Owner | Review Trigger | Status`

Statuses: `open`, `validated`, `invalidated`, `retired`.

## Decision

`ADR-###`: `ID | Decision | Rationale | Consequences | Status | Owner | Approved By`

Statuses: `proposed`, `accepted`, `rejected`, `superseded`. An accepted decision requires a named
human approver. Agents may draft or request acceptance but must not populate their own approval.
Represent a security exception as an explicit decision linked to a risk and evidence; both records
retain normal human approval requirements.

## Risk

`RSK-###`: `ID | Risk | Likelihood | Impact | Mitigation | Owner | Status | Approved By`

Statuses: `open`, `mitigated`, `accepted`, `closed`. Accepting a residual risk requires a named
human approver. Mitigated and closed risks retain attribution when available.

## Evidence

`EVD-###`: `ID | Supports | Source | Retrieved On | Notes`

`Supports` is a comma-separated list of `REQ`, `ASM`, `ADR`, or `RSK` IDs. `Retrieved On` uses ISO
`YYYY-MM-DD`. Accepted or verified requirements, validated assumptions, accepted decisions, and
mitigated/accepted/closed risks require supporting evidence.

## Validation

The parser reports stable diagnostics for malformed or duplicate IDs, missing columns and required
fields, invalid statuses, dangling evidence references, evidence gaps, invalid retrieval dates, and
accepted decisions or risks without human approval attribution. Record data is available through the
public TypeScript types, `archwork context`, and MCP resources.
