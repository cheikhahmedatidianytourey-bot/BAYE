# BAYE v4.7 — Atomic Mission Coordination Foundation

## Goal
Introduce a PostgreSQL-backed coordination primitive before any worker resumption, automatic retry, or cross-instance mission execution is enabled.

## Delivered in this slice
- A PostgreSQL-compatible store with an explicit schema initializer.
- One atomic `INSERT .. ON CONFLICT .. DO UPDATE .. RETURNING` statement to claim a mission task under the unique owner/mission/task key.
- Conditional claims only when the prior claim is expired or explicitly retryable/released.
- A stable idempotency key is bound to the logical task; a different key cannot silently take over the same task row.
- Every successful reclaim increments a monotonically increasing fencing token.
- Lease renewal and settlement require the current claim owner, fencing token, active lease, and claimed state.
- Expired or superseded workers cannot renew or settle with an old fencing token.
- Inspection returns coordination metadata only, not task outputs.

## Critical integration boundary
This module is deliberately not wired into the orchestration runtime in this PR. The existing JSONL ledger remains the checkpoint history store. A later integration must coordinate PostgreSQL claim transitions and checkpoint updates with explicit failure semantics before any worker can be resumed.

The application must supply a shared PostgreSQL pool and apply the schema migration explicitly. No Render database, environment variable, secret, paid resource, deployment, or production configuration is created or changed by this PR.

## Idempotency and external effects
A fencing token protects BAYE's coordination state; it cannot by itself prevent a stale worker from completing an arbitrary external side effect. External providers must accept the same stable idempotency key, or the task must stop in `needs_review` for reconciliation. BAYE must not claim generic exactly-once execution.

## Verification scope
Unit tests verify input bounds, SQL shape, conditional update predicates, fencing-token propagation, and fail-closed null results with a PostgreSQL-compatible test double. They do **not** prove actual PostgreSQL concurrency, transaction behavior, crash recovery, or production readiness. Those require integration tests against a real PostgreSQL instance and a separate runtime-wiring review.

## Not included
- No automatic retry, replay, or mission resume.
- No worker invocation from this store.
- No runtime integration or default database connection.
- No Render infrastructure changes.
- No exactly-once guarantee for external side effects.
