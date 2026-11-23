# BAYE v5.3 — Crash recovery and execution continuity policy

## Objective
Define conservative, durable recovery decisions for coordinated missions after worker/process interruption. This document is a policy foundation, not a claim that recovery is implemented or production-enabled.

## Recovery invariants
- A task must never be resumed solely because a worker disappeared or a lease expired.
- Recovery decisions must be based on durable mission/task state, claim expiry, idempotency identity, and the available execution checkpoint.
- Fencing tokens must advance on reclaimed claims; stale claimants cannot settle the current claim.
- Tasks with uncertain external side effects default to `needs_review`, unless an explicit task contract supports safe replay.
- Recovery must not claim exactly-once execution. Idempotency and fencing are defense-in-depth; external systems must independently support idempotency/fencing where needed.
- Recovery operations are bounded, auditable, and scoped to the mission/task identifiers.

## Decision policy
| Durable state / evidence | Decision |
| --- | --- |
| Task terminal state (`completed`, `failed`, `cancelled`) with valid durable record | Do not replay automatically |
| Active claim with unexpired lease | Wait; do not compete |
| Expired claim; task contract declares replay-safe and durable checkpoint validated | Eligible for controlled reclaim; increment fencing token |
| Expired claim; side effects uncertain or replay-safety unknown | `needs_review`; no automatic replay |
| Durable checkpoint invalid, missing, or inconsistent | `needs_review` |
| Reclaim succeeds but prior claimant may still execute | New claimant must fence coordination; external side-effect protection remains system-specific |

## Recovery flow (future implementation)
1. Read durable mission/task state and verify identifiers.
2. Confirm claim lease expiry using database time, not worker clock.
3. Validate checkpoint, task replay contract, retry budget and side-effect risk.
4. For safe tasks only, reclaim atomically using existing idempotency identity and an incrementing fencing token.
5. Record recovery attempt, reason, checkpoint version and claim owner.
6. Run under renewed lease and cooperative cancellation.
7. Settle only with current fencing token; if settlement is ambiguous, do not blindly replay.
8. Route unsafe/ambiguous cases to review.

## Retry limits and observability
Implementation should add configurable bounded retry/recovery budgets, backoff, audit fields (attempt number, recovery reason, checkpoint version, token), and clear mission-level status. Defaults must be conservative; retry budget exhaustion leads to review rather than infinite retry.

## Validation plan
- Unit tests for each policy decision, malformed/missing checkpoints, replay contract, retry exhaustion and review routing.
- PostgreSQL integration tests using a dedicated database for lease expiry, atomic reclaim, token advancement, stale-settlement rejection, cleanup and concurrent recovery.
- Failure injection for process interruption and ambiguous settlement.
- Do not use production data or secrets in tests.

## Scope and safety
This policy does not implement automatic mission recovery, provision databases, enable public execution, modify Render, deploy, or establish process termination or exactly-once guarantees. Implementation requires subsequent code changes and test evidence.
