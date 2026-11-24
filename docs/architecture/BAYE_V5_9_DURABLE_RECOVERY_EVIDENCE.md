# BAYE v5.9 — Durable recovery evidence

## Objective
Recovery safety decisions must use durable metadata read independently of the recovery requester. Caller-provided replay-safety, checkpoint, side-effect and retry-budget fields are ignored.

## Storage
The coordination schema now creates `baye_mission_task_recovery_evidence`, keyed by owner/mission/task. It stores:
- replay-safety and checkpoint-validity booleans;
- side-effect uncertainty;
- current and maximum recovery attempts;
- a positive evidence revision.

The coordination store exposes a read-only `inspectRecoveryEvidence()` method. This change intentionally does not add a public evidence writer or allow recovery workers to author their own safety evidence.

## Recovery gate
The adapter validates request identity and lease duration, reads the PostgreSQL claim snapshot, then reads durable evidence. Missing or malformed evidence returns `needs_review` and never calls atomic reclaim. Policy evaluation receives only persisted claim state and persisted evidence. The final reclaim remains bound to the inspected fencing generation.

## Trust boundary and operational requirement
Durable storage is not, by itself, proof of trustworthy provenance. Only a separately authorized mission/task lifecycle component may populate or update evidence rows. Database roles used by recovery workers should be read-only for this evidence table; migrations and trusted lifecycle services own writes. Evidence revision is recorded for traceability, but this PR does not cryptographically attest evidence or implement the trusted writer.

## Validation
Unit tests cover missing, malformed and hostile caller-supplied evidence. The opt-in PostgreSQL integration test verifies schema creation and evidence reads when `BAYE_TEST_DATABASE_URL` is configured.

## Boundaries
No task execution, automatic retry loop, evidence-authoring API, provenance signature, production worker wiring or deployment is introduced. PostgreSQL runtime validation remains conditional on the integration-test database being available.
