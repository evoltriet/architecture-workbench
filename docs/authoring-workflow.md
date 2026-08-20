# Authoring Workflow

Architecture Workbench treats architecture writing as
`discover -> design -> specify -> critique -> revise -> approve -> publish`, not as a one-time prose
exercise. Humans and agents use the same canonical source and deterministic gates.

## 1. Frame The Decision

Identify the reader, the decision they must make, what is in and out of scope, and which team will
own each resulting control. A hosting audience needs capacity signals, quotas, network boundaries,
state ownership, recovery, and readiness evidence. An implementation audience additionally needs
domain, API, sequence, state, and failure semantics.

## 2. Establish Requirements And Assumptions

Separate known requirements from planning assumptions. Quantify annual volume, peak arrival rate,
average and tail runtime, retry inflation, retention, availability, progress freshness, cancellation
latency, and recovery objectives. Include calculations and name the owner who will replace each
assumption with measured data.

Capture these as stable `REQ` and `ASM` tables. Record consequential decisions as `ADR`, material
risks as `RSK`, and supporting sources as `EVD`. Preserve IDs through revision so reviews can trace
what changed.

## 3. Build Views In Reading Order

Start with context and component boundaries, then move through domain and configuration, runtime
behavior, APIs, scale, resilience, security, human intervention, ownership, and deployment. This
order lets readers understand the logical system before seeing a cloud-specific example.

Use diagrams when relationships or transitions matter. Use tables when readers must compare
policies, ownership, failure modes, or retention. Keep prose for rationale and consequences.

## 4. Specify Behavior, Not Just Components

At minimum, show the normal sequence, admission rejection, deterministic runtime failure, human
gate, end-to-end operation state, and retry/escalation decision. Define external and internal API
signatures, stable identifiers, idempotency, checkpoints, and permitted actions in each state.

## 5. Review Across Disciplines

Run both deterministic checks:

```bash
archwork validate --strict
archwork review
```

Use `archwork context --include-source --format json` to give an agent bounded project context and
`archwork status` to see the next lifecycle gate. A green status reports structural readiness, not
architectural correctness.

Then conduct focused reviews with implementation, platform, security, operations, and compliance
representatives. Use the prompt pack as a vendor-neutral facilitation aid, not as an approval
substitute.

Agents may propose decisions, risk treatment, and security exceptions. A named human approves or
rejects them and separately authorizes external publication.

## 6. Build And Inspect

Generate the deliverable only after source and diagram validation pass:

```bash
archwork build
```

Open the DOCX in Word and import it into Google Docs when those are target clients. Confirm heading
hierarchy, TOC behavior, table widths, image legibility, page breaks, and captions. Keep visual QA
files outside version control.

## 7. Maintain The Architecture

Review architecture source in pull requests. Update assumptions when telemetry changes, append or
revise decisions when trade-offs change, and re-export diagrams whenever their editable source
changes. CI should publish the current DOCX artifact from the reviewed commit.
