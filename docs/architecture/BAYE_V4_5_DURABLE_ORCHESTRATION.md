# BAYE v4.5 — Durable Orchestration Integration

## Scope
This change connects authenticated specialist orchestration to the append-only durable mission ledger. It creates a mission checkpoint before worker execution and persists task state transitions using revision-guarded ledger writes.

## Behavior
- Authenticated requests receive a server-generated mission ID when none is supplied.
- The verified identity subject is SHA-256 namespaced before it is used in ledger paths.
- A validated bounded execution graph is fingerprinted and bound to the checkpoint.
- Initial pending state is persisted before any specialist is invoked.
- Each task transition (ready, running, succeeded, failed, cancelled) is persisted.
- A running attempt is durably recorded before its worker is called. If that write fails, execution does not begin.
- Successful task outputs are stored in the checkpoint, subject to existing output and checkpoint size limits.
- Final mission status is persisted with a revision guard.
- Anonymous orchestration remains backward compatible and does not write authenticated checkpoints.

## Safety boundaries
- No automatic retry or task replay is enabled.
- A process interruption after a running checkpoint remains ambiguous and must be reconciled by the v4.4 recovery planner.
- The ledger currently serializes writes within one process only. Multi-process and multi-instance safety is not claimed.
- Durable storage depends on the configured Render disk/path. The default path is /data/baye-mission-ledger; deployment configuration is not changed by this PR.
- This PR does not add a recovery execution endpoint or resume workers.

## Verification
The test suite covers task transition persistence, output retention, revision integrity, owner namespace validation, and fail-closed behavior when a running checkpoint cannot be written.
