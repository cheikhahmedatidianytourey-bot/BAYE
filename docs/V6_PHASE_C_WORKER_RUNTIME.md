# BAYE V6 Phase C — worker runtime

Phase C introduces a single-process, injected-handler worker runtime on top of the mission schema and filesystem store.

- Processes one dependency-ready task per invocation; missions can be advanced incrementally.
- Persists state before and after task execution.
- Tracks heartbeat updates, checkpoint progress and bounded task attempts.
- Limits batch processing to 100 missions per call.
- Task execution is injected explicitly; the worker does not enable arbitrary tools or external side effects itself.
- Failed tasks are retried within the configured attempt limit; exhausted missions become terminal failed.
- Completed/cancelled missions are not restarted.

## Important limitations
This is a single-process worker without distributed leases, scheduler, cross-process locking, automatic periodic execution, or multi-instance coordination. Do not deploy it as a multi-instance execution service. The worker is not connected to the public API in this phase. Task handlers must independently enforce permissions, timeouts, idempotency, resource controls and safe side-effect policy.

## Validation
Run tests/build on this candidate and its stacked base before promotion. No merge or deployment is performed by this PR.
