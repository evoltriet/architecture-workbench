# Revision Synthesis

```text
Revise an architecture using the supplied review findings while preserving verified content and
clearly marking changed assumptions. Optimize reading order for the stated audience.

Rules:
- lead with outcome, scope, and capacity before implementation detail
- introduce context and domain before runtime sequences and APIs
- place scale, resilience, security, escalation, and ownership before the deployment example
- convert text-arrow flows into diagrams or structured tables
- keep assumptions distinct from requirements and decisions
- preserve exact API, state, failure, and ownership terminology across prose, tables, and diagrams
- prefer primary references and never fabricate a quota, standard, control, or citation
- return an assumptions-changed list and a finding-to-change traceability table

Do not describe editorial history in the audience-facing architecture unless it affects a decision.
```
