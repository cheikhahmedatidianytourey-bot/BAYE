# BAYE v4.4 — Mission Recovery Engine (first slice)

## Scope
This change introduces a pure, bounded recovery planner. It reads an already-loaded checkpoint and a previously validated task graph, then returns a conservative recovery decision. It does not execute tasks, write checkpoints, schedule retries, or call providers.

## Decision policy
- A task marked `succeeded` is preserved only when its output or output digest is present in the checkpoint.
- A task left `running` by a prior process is uncertain and becomes `needs_review`; it is never replayed automatically.
- Failed, cancelled, and already-review-required tasks become `needs_review` because retry safety is not yet established.
- Pending/ready tasks become resumable only when every dependency has a checkpointed successful output.
- Tasks with unresolved dependencies remain blocked.
- Mission completion is reported only when every graph task has a checkpointed successful output.

## Safety boundaries
- Mission ID and graph digest are checked by the existing checkpoint validator.
- Unknown checkpoint task IDs, unknown graph dependencies, duplicate IDs, cycles, and oversized graphs are rejected.
- The planner is side-effect free: zero workers, retries, external actions, or checkpoint writes.
- No idempotency guarantee is claimed. A future execution layer must introduce durable attempt keys, retry classification, and reconciliation before enabling automatic retries.

## Verification
Synthetic unit tests cover completed work preservation, interrupted execution, unsafe retry suppression, missing dependency outputs, graph/mission mismatch, unknown tasks, cycles, and bounded graph size.

## Limitations
This is a planning foundation, not an operational recovery scheduler. It is not wired into the live orchestration service or API routes. No production recovery, crash/restart integration, distributed locking, or provider-side idempotency has been verified.
