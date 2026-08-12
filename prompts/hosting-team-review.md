# Hosting-Team Review

```text
Review this architecture from the perspective of the team that must host and operate it. Findings
come first, ordered by severity. Cite the section or diagram that creates each concern.

Check:
- whether request rate, in-flight concurrency, runtime percentiles, retries, and quota headroom are
  quantified consistently
- independent scaling signals for API, workflow, queue, workers, stores, and observability
- admission control, backpressure, per-route bulkheads, circuit breakers, and poison-message policy
- network boundaries, outbound destinations, workload identity, secrets, and key ownership
- durable state ownership, backup scope, restoration, RTO, RPO, and regional recovery
- alerts, dashboards, progress freshness, cancellation latency, and degraded caller messaging
- exact ownership between solution and hosting teams and readiness evidence for shared controls

Do not reward a product-specific deployment diagram if behavioral requirements and operating
contracts are missing. End with the smallest set of changes needed for a hostability decision.
```
