# BAYE V6 — Core Orchestrator Foundation

This draft introduces a small, provider-neutral orchestration boundary; it is not yet the full durable mission engine.

## Implemented in this draft
- Injected planner, executor and policy gate (no implicit provider/tool execution).
- Bounded task plans with unique IDs, required capability declarations, dependency validation and cycle detection.
- Deterministic topological ordering.
- Sequential execution with dependency results passed to downstream tasks.
- Abort signal checks and a policy gate before side effects.
- Automated unit tests for plan validation, ordering, policy denial and cancellation.

## Not implemented / not verified
- Durable orchestration state, mission-repository integration, distributed leases/fencing, retries, recovery or checkpoint writes.
- Model/provider registry, agent delegation, routing, budgets, external tools, sandboxing or production security.
- Runtime/API wiring, CI validation, deployment or operational readiness.

## Next gates
1. Add durable execution and task state via a compatible repository contract.
2. Add provider capability registry, routing constraints and quotas.
3. Add sandboxed executor adapters, idempotency, cancellation and retries.
4. Add independent verification, observability, tenant isolation and integration tests.
5. Validate CI before considering promotion.
