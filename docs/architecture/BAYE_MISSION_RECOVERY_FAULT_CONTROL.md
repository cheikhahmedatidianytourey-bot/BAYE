# BAYE v4.1 — Mission Recovery & Fault Control

## Objective
Define a bounded, auditable recovery contract for specialist missions before adding persistence or automatic retries. A mission must never be reported complete based only on a worker's assertion.

## Recovery contract
- **Checkpoint boundary:** checkpoint after each task transition and after validated output acceptance. Checkpoints include schema version, mission ID, graph digest, task state/history, accepted outputs, attempt counters, timestamps, and recovery metadata.
- **Integrity and scope:** validate schema, mission ID, graph digest, and size limits before use. Reject unknown schema versions, mismatched graphs, malformed histories, and oversized records. Do not silently repair.
- **Atomic persistence:** storage adapter must provide atomic checkpoint replacement or transactional writes. Concurrent writers must be guarded by a lease/compare-and-swap or equivalent.
- **Idempotency:** each task attempt has a deterministic mission/task/attempt key. Retry only when the executor declares the operation retry-safe and the failure category permits it. Non-idempotent or uncertain outcomes are marked **needs_review**, never replayed automatically.
- **Bounded retry:** maximum attempts, backoff, wall-clock budget, and parallelism are configurable but hard-capped. Retry budget is consumed durably.
- **Fault isolation:** task failures must not expose raw provider secrets or internal stack traces. Record a normalized error category and limited diagnostic metadata.
- **Dependency correctness:** downstream tasks run only after dependency outputs are checkpointed and validated. Failed or uncertain dependencies block downstream execution.
- **Completion evidence:** final mission status requires all tasks terminal and successful, outputs validated, and checkpoint persisted. Mission completion is not inferred from text.
- **Recovery:** resume from validated checkpoints; completed tasks are not rerun. Running tasks from a prior process are treated as uncertain until reconciled; do not assume they failed or succeeded.
- **Cancellation:** durable cancellation signal takes precedence at scheduling boundaries. In-flight work may be marked uncertain if cancellation cannot safely stop it.

## Proposed checkpoint shape (illustrative)
```json
{
  "schemaVersion": 1,
  "missionId": "bounded-id",
  "graphDigest": "sha256:...",
  "status": "running",
  "revision": 4,
  "tasks": {
    "task_id": {
      "status": "succeeded",
      "attempt": 1,
      "outputDigest": "sha256:...",
      "output": {},
      "history": []
    }
  },
  "updatedAt": "ISO-8601"
}
```

## Implementation sequence
1. Define pure checkpoint validation and canonical graph/output digests.
2. Implement an in-memory checkpoint adapter for deterministic tests.
3. Add a persistence adapter behind an explicit interface; atomicity and concurrency tests required.
4. Add resume behavior and reconciliation of interrupted attempts.
5. Add retry classification and durable budgets, defaulting to no automatic retry.
6. Add observability and benchmark recovery scenarios.

## Safety test matrix
- corrupt, oversized, stale, or schema-unknown checkpoint rejected
- mission/graph mismatch rejected
- checkpoint write failure blocks success
- CAS/lease conflict blocks concurrent resume
- completed task not replayed
- uncertain attempt not automatically replayed
- retry budget exhaustion blocks retry
- unsafe executor is never retried
- dependency output missing/invalid blocks downstream
- secret-bearing provider error is redacted
- cancellation honored at safe scheduling boundary
- recovered mission cannot claim success until final persisted state

## Status and scope
Architecture specification only. No persistence adapter, retry behavior, or recovery capability is implemented or verified by this document. All future recovery tests should use synthetic data and mock executors. Production and live-provider execution remain out of scope.
