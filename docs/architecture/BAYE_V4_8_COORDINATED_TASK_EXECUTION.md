# BAYE v4.8 — Coordinated task execution adapter

This change adds an opt-in adapter between specialist runtime task calls and the v4.7 PostgreSQL claim store.

- Claims are obtained before a specialist executor is invoked; a denied claim blocks execution.
- A task is settled as completed only after its executor returns and the claim settlement is accepted.
- Executor exceptions are conservatively settled as needs_review; automatic retry/replay is not enabled.
- If completion settlement is lost, the adapter fails closed rather than reporting success.
- Runtime and orchestration service accept an injected coordination adapter; this PR does not configure a live PostgreSQL pool, create Render resources, or enable it on the public endpoint.
- Lease renewal during long-running tasks, worker heartbeats, automatic recovery, external-provider idempotency and crash recovery are not implemented.

Tests use a controlled store double for adapter semantics. PostgreSQL concurrency semantics remain covered by the v4.7 integration tests, not by this adapter test.
