# Review Rubric

`archwork review` scores twelve dimensions from zero to five. It searches headings, content signals,
diagram names, and related record IDs; it does not judge correctness or replace expert review.
Incomplete dimensions return stable `coverage.<dimension>` gap codes, evidence, affected record IDs,
a recommendation, and a suggested next action.

| Dimension                    | Strong evidence                                                     |
| ---------------------------- | ------------------------------------------------------------------- |
| Audience, scope, and drivers | Decision audience, boundaries, quality attributes, assumptions      |
| Context and components       | System boundary, dependencies, state and failure ownership          |
| Domain and configuration     | Entities, versioned artifacts, runtime state, precedence and policy |
| Behavior                     | Normal and error sequences, lifecycle hooks, end-to-end state model |
| API and data contracts       | Stable identifiers, schemas, events, idempotency and actions        |
| Capacity                     | Volume, peak rate, p95 or p99 runtime, concurrency and quota fit    |
| Resilience                   | Retry budgets, timeout, isolation, quarantine, RTO and RPO          |
| Security and privacy         | Trust boundaries, minimization, identity, encryption and access     |
| Audit and evidence           | Actor, timestamp, decision, integrity, redaction and retention      |
| Human intervention           | Pause, cancel, resume, override, ambiguity and fail-closed behavior |
| Ownership                    | Product, hosting, managed-service and shared responsibilities       |
| Deployment and decisions     | Deployable example, trade-offs, triggers and primary references     |

## Interpreting Scores

- 90-100 percent: broad coverage; concentrate expert review on correctness and unresolved risk.
- 75-89 percent: useful working architecture with identifiable gaps.
- 50-74 percent: orientation document; behavioral or operational specification is incomplete.
- Below 50 percent: reframe scope and required views before deployment review.

A high score can still describe a poor design. Reviewers must validate assumptions, calculations,
contracts, threat boundaries, failure safety, and the realism of operating responsibilities.
