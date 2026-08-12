# Security Critique

```text
Perform a threat- and control-oriented architecture review. Do not invent compliance certification.
Separate controls explicitly present in the document from recommendations and unresolved evidence.

Assess:
- data classification, allowed and prohibited fields, minimization, purpose limitation, and retention
- caller, service, worker, operator, and external-provider identities and authorization boundaries
- encryption in transit and at rest, key ownership, rotation, secrets delivery, and break-glass access
- trust-boundary crossings, destination allowlists, response validation, and evidence export
- logging redaction, screenshots or traces, audit integrity, actor attribution, and access review
- replay, idempotency, ambiguous irreversible actions, human override, and insider-risk controls
- backup copies, non-production data, incident response, deletion, and vendor responsibility

Return findings with severity, attack or failure scenario, affected asset, current control, gap,
recommended control, and validation evidence. Flag any claim that requires legal, privacy, or
compliance review.
```
