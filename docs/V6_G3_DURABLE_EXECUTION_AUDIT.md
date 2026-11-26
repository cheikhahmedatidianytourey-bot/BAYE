# BAYE V6 G3 — Durable Execution Engine: Audit and Design

## Status
Design and implementation gate. This document records an audit of the existing mission engine, worker, and filesystem store. It does not claim distributed execution, production persistence, or deployment.

## Audit findings from the current code
- Mission validation uses recursive dependency traversal, which can exhaust the JS stack on deep mission graphs.
- Mission/task records do not impose hard task-count, dependency-count, description-size, constraint-size, audit-size, or result-size limits.
- Filesystem store serializes writes only within one process; it does not provide cross-process locking, compare-and-swap, leases, fencing tokens, or recovery coordination.
- Worker active-mission guard is process-local; two processes may execute the same mission/task concurrently.
- Worker persists running state before execution; a process crash may leave a task or mission permanently marked running.
- Retry logic resets task state without scheduling backoff; mission-level retry metadata is not a durable scheduling policy.
- Results are JSON-stringified and truncated to 2000 characters, which can truncate JSON and lose useful structured data.
- Tenant/owner isolation must be enforced at store and API boundaries, not merely trusted from mission records.
- Abort/cancellation is not a durable, cross-process protocol.
- Persistence adapter compatibility must be normalized: filesystem MissionStore returns mission records directly, while the G1 repository design uses wrapper return shapes. An explicit adapter contract is required.

## Target architecture
1. **Canonical persistence contract** — get, create, update-with-version/CAS, list scoped to tenant, claim, heartbeat, checkpoint, append audit, and recovery queries; normalize all adapters to one return shape.
2. **Atomic claim + lease** — claim queued/retryable work using a transaction or atomic operation; owner ID, lease expiry, monotonic fencing token; reclaim expired leases only with fencing.
3. **Task idempotency** — deterministic execution keys; handlers declare idempotency requirements; side effects require safe replay strategy or explicit approval.
4. **Checkpoints** — store task progress and bounded structured outputs; durable checkpoint before moving to subsequent tasks.
5. **Retry policy** — configurable bounded attempts, exponential backoff with jitter, retry classification, persisted next-run timestamp, dead-letter/terminal status.
6. **Cancellation** — durable cancellation intent and worker polling/heartbeat checks; cancellation acknowledged at safe boundaries.
7. **Recovery** — startup and periodic sweeps for expired leases, interrupted tasks, retry windows and terminal records.
8. **Resource budgets** — task and mission limits for time, memory where enforceable, output size, retries, concurrency, and provider/tool cost.
9. **Tenant isolation** — owner-scoped storage queries, authorization checks, tenant-scoped identifiers, no leakage in errors or logs.
10. **Observability** — structured events, bounded audit, timings, retry counts, lease and checkpoint metadata; redact secrets.
11. **Adapter conformance tests** — same contract tests against filesystem and PostgreSQL adapters; race, crash/recovery, tenant isolation, replay, and failure injection.
12. **Worker topology** — single-process local worker is a development mode; multi-worker execution must use atomic claims and fencing, not process-local locks.

## Incremental implementation gates
- G3.1: schema/validation hard limits and iterative cycle detection.
- G3.2: storage contract, versioning/CAS, adapter normalization.
- G3.3: atomic claims, leases, heartbeats and fencing.
- G3.4: checkpoint/retry scheduling and recovery.
- G3.5: cancellation and budgets.
- G3.6: conformance, adversarial and failure-injection tests.
- G3.7: runtime integration only after tests and review; deployment remains separately approved.

## Non-goals for this phase
No production database provisioning, schema migration, deployment, merge, arbitrary tool execution, or claims of autonomous self-learning.