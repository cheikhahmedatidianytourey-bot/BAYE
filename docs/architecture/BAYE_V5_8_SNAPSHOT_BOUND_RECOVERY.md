# BAYE v5.8 — Snapshot-bound recovery

## Change
Recovery no longer calls the general-purpose initial-claim upsert. It now:

1. Reads the persisted coordination row through `inspect()`.
2. Uses the database status and database-computed lease-expiry flag for policy evaluation; caller-supplied copies cannot override them.
3. Rejects persisted `needs_review`, unknown states, terminal states, and active leases.
4. Calls a dedicated `reclaim()` UPDATE constrained by owner/mission/task, idempotency key, the exact inspected fencing token, an eligible persisted status, and an expired lease.
5. Treats a zero-row UPDATE as a lost race/denial.

## Concurrency guarantee
Two recovery workers may inspect the same generation, but only one can advance that fencing token. The other receives a denial because its compare-and-swap predicate no longer matches. The normal `claim()` path remains available for initial coordination and is not used by this recovery adapter.

## Boundaries
Replay-safety, checkpoint-validity, side-effect uncertainty, and recovery-budget evidence must still be loaded from trusted durable mission metadata by the caller. This layer does not authenticate that provenance, execute tasks, perform automatic retries, wire production workers, or prove a live PostgreSQL deployment. The PostgreSQL integration test remains opt-in through `BAYE_TEST_DATABASE_URL`.
