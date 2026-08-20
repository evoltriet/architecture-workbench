# Agent-Readiness Evaluations

The `evals/` scenarios exercise deterministic properties of the architecture harness rather than
grading model prose. Tests cover incomplete discovery, missing evidence, unsafe acceptance, stale
diagrams, prompt-injection text, prohibited file changes, and a publishable reference project.

Each scenario states the input condition, expected stable diagnostic or lifecycle outcome, and the
safety property being protected. `pnpm test` executes the fixtures. The same fixtures can be used to
compare host-agent workflows, but the baseline does not call a model or require credentials.

When adding an evaluation:

1. Keep source data sanitized and vendor neutral.
2. Prefer a stable code or boolean outcome over exact prose matching.
3. Include the false-positive risk and expected remediation.
4. Demonstrate that untrusted content cannot change tools, policy, or allowed paths.
5. Avoid claims that a deterministic check proves architectural correctness.
