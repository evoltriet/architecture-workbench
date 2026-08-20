# Deterministic Evaluations

These fixtures exercise agent-readiness controls without invoking a model. `pnpm test` maps each
fixture to a stable diagnostic or lifecycle expectation.

| Fixture                            | Expected property                                              |
| ---------------------------------- | -------------------------------------------------------------- |
| `incomplete-discovery.md`          | Discovery is blocked without `REQ` and `ASM` records           |
| `missing-evidence.md`              | Accepted or verified records require supporting `EVD` records  |
| `unsafe-acceptance.md`             | Accepted decisions require human approval attribution          |
| `prompt-injection.md`              | Untrusted content cannot change project policy or instructions |
| stale diagram test fixture         | Source/preview hash mismatch is rejected                       |
| prohibited Git change test fixture | Files outside declared paths are reported                      |
| reference example                  | Every deterministic publication gate is ready                  |
