# BAYE v4.6 — Mission Recovery Preview

## Scope
Adds an authenticated, read-only recovery inspection endpoint for durable specialist missions. This is the first safe integration of the v4.4 recovery planner with the v4.5 mission ledger.

## API
- `POST /api/orchestration/:missionId/recovery-preview`
- Requires a valid BAYE identity token.
- Request body: `{ "tasks": [...] }`, using the same bounded task graph contract as authenticated orchestration.
- The owner namespace is derived server-side from the verified identity; clients cannot choose an owner ID.
- BAYE rebuilds the bounded execution graph, computes its canonical execution digest, and loads only the matching checkpoint.

## Safety
- Read-only: no ledger writes, worker invocation, retry, replay, or external action.
- A succeeded task is considered completed only when its output is checkpointed.
- A task left running, failed, cancelled, or marked for review remains `needs_review`; it is never automatically retried.
- Tasks depending on uncertain work remain blocked.
- A graph/checkpoint mismatch is rejected by the existing ledger validation.
- The endpoint does not expose raw checkpoint outputs.

## Deliberate limitation
This does not yet resume a mission. Before any execution/resume feature, BAYE needs cross-process claim/locking or an equivalent atomic coordination primitive, explicit idempotency policy, and a tested reconciliation protocol. The current JSONL ledger only serializes writes within one process, so automatic recovery across multiple instances would be unsafe.

## Verification
Unit tests cover matching checkpoint inspection, missing missions, owner/mission validation, and proof that inspection does not call ledger save. CI is required before treating this change as validated.
