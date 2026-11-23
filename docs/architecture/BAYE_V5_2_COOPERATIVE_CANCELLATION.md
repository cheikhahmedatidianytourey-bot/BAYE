# BAYE v5.2 — Cooperative cancellation on coordination lease loss

This change passes an AbortSignal to task execution callbacks and aborts it when lease renewal fails or settlement is rejected after execution.

## Behavior
- The executor exposes `signal` to the callback alongside task, dependencies, and missionMemory.
- Renewal failure requests cancellation via AbortController and rejects the coordination race.
- Failure handling requests abort if work is still active and attempts a `needs_review` settlement.
- Unit tests use a fake coordination store to verify abort signaling and success-path behavior.

## Limitation
Cancellation is cooperative. A worker that ignores the signal may continue running, and already-performed external effects cannot be undone. This does not establish process-level termination, exactly-once behavior, or fencing of external systems.

## Validation
The test uses a mocked store; PostgreSQL runtime tests remain opt-in and require a dedicated test database. No deployment or production wiring is included.
