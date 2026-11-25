# BAYE V6 — Long-Running Mission Engine (design proposal)

Status: design proposal; not implemented or production-validated.
Branch: baye-v6-long-running-missions

## Goal
Allow missions to persist for long periods, survive process restarts, resume from checkpoints, and make progress without imposing a fixed mission-wide duration. Each individual task still has explicit resource, safety and provider limits.

## Current baseline (main)
- Safe workflow: 1–5 sequential steps; fail-fast; calculator and text-stat tools only; no external side effects.
- Workflow results receive SHA-256 integrity receipts. These receipts establish output integrity against a stored hash, not correctness or truth.
- MemoryEngine and SENTINEL history are file-based and single-process only.
- No durable mission queue, worker lease, mission checkpoint, cancellation, retry scheduler or distributed coordination is present in the audited code.

## Proposed mission lifecycle
queued -> running -> waiting -> running -> completed
                    \-> failed (retryable/non-retryable)
                    \-> cancelled
                    \-> paused (operator/user requested)

Each transition must be persisted and validated. Terminal states: completed, failed, cancelled. Paused missions may be resumed.

## Mission record (versioned schema)
- id (UUID), schemaVersion
- owner/session reference (privacy-minimized; no secrets)
- goal and normalized constraints
- status, createdAt, updatedAt, lastHeartbeatAt
- plan: ordered tasks with stable IDs, dependencies and state
- checkpoint: last committed task/result references
- attempt counters and retry metadata
- budget policy: provider-call ceiling, token ceiling when known, wall-clock/worker execution ceiling per task, optional spending ceiling
- consent/approval flags for tools with external effects
- verification metadata and audit events

Never store API secrets, raw credentials, or unnecessarily sensitive user content in mission records.

## Architecture
1. API layer: create mission, retrieve status, pause/resume/cancel, approve a bounded external action. Validate owner/session and authorization on every operation.
2. Durable queue: DB-backed claim mechanism (or queue with equivalent persistence); not in-process memory. Avoid requiring paid infrastructure until cost/requirements are evaluated.
3. Worker: claim a mission/task using a lease; heartbeat; execute one bounded task; persist its result and checkpoint before claiming the next.
4. Checkpoint store: transactional state and result references. Commit each completed task atomically with state transition. Idempotency keys prevent duplicate effects.
5. Retry policy: transient errors only, capped exponential backoff with jitter; distinguish provider failure, validation failure, cancellation, budget exhaustion and permanent errors.
6. Verification: task-specific checks; receipts are integrity metadata, not proof of correctness. Preserve source evidence when applicable.
7. Safety: tool allowlist and per-action approval; classify external side effects; least privilege; confirmation for consequential actions; cancellation checks between tasks and before side effects.
8. Observability: status, task history, heartbeat age, retries, checkpoint, estimated/actual resource usage where available, and redacted errors.
9. Recovery: expired lease allows safe reclaim; recover from last committed checkpoint; never silently rerun a non-idempotent external action.
10. Cost controls: hard limits per task and optional mission budgets, graceful stop on budget exhaustion, no automatic paid provider switch.

## Suggested API (not implemented)
- POST /api/missions — create/validate mission and enqueue
- GET /api/missions/:id — status and progress
- POST /api/missions/:id/pause
- POST /api/missions/:id/resume
- POST /api/missions/:id/cancel
- POST /api/missions/:id/approve — scoped approval for a specified action only

## Implementation sequence
Phase A: choose persistent transactional store and migration approach; create schema, state machine and validation tests.
Phase B: implement durable queue/worker leases, heartbeat and recovery.
Phase C: task checkpoints, idempotency and retry/backoff.
Phase D: safe tool registry, approval gate, cancellation and budgets.
Phase E: monitoring, load/concurrency/recovery tests and operational documentation.
Phase F: controlled deployment; verify persistence, restart recovery, duplication prevention and cost limits.

## Acceptance tests
- A mission with many tasks progresses without a mission-wide fixed step cap, while each task remains bounded.
- Restart worker/service mid-task; recover from last committed checkpoint.
- Concurrent workers cannot claim the same task lease.
- Lease expiry/reclaim does not duplicate completed or non-idempotent actions.
- Pause, resume and cancel work and are persisted.
- Retry transient failures with bounded backoff; no retry for permanent failures.
- Mission/task budget exhaustion is enforced and visible.
- Tool approval is scoped, auditable, expires or is consumed as defined, and is required for consequential external actions.
- Results and state transitions survive restarts.
- Secrets and sensitive payloads are absent from logs and mission audit records.
- Multi-instance integration tests pass before enabling horizontal scaling.

## Key design principle
No artificial mission-duration cap at the mission level is the target. Reliability is achieved through durable checkpoints and resumability, not through an unbounded single request, process, loop or worker execution.
