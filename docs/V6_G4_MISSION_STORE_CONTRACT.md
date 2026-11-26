# V6 G4 — Canonical MissionStore contract

## Objective
Define the persistence boundary for mission orchestration before introducing a second storage backend. Existing runtime uses a filesystem JSON MissionStore; PostgreSQL schema work is a foundation, not an integrated adapter. This contract is deliberately backend-neutral and avoids claiming database readiness.

## Canonical interface

All implementations must expose asynchronous methods:

- `init()`: prepare/validate backend configuration; safe to call repeatedly. No destructive setup or schema migration unless explicitly authorized.
- `create(mission)`: validate the canonical mission record and create it only if its ID does not already exist. Return an isolated copy. Duplicate IDs must fail.
- `get(id)`: return isolated record or `null`; invalid IDs must fail safely.
- `save(mission)`: validate and persist an existing record; missing records must fail. Backend-specific concurrency protection is required before multi-process production use.
- `list()`: return validated records in deterministic order; callers must not rely on this method for tenant authorization. Records must be isolated copies.

## Data invariants

- Canonical mission shape and validation remain owned by `mission-engine.js`; adapters must not silently rewrite semantics.
- Preserve ownerRef, task dependencies, checkpoints, retries, approvals, audit entries, timestamps and schemaVersion.
- Tenant isolation must be enforced at query boundaries in production adapters, not only by filtering returned lists in route code.
- Reads must not expose mutable backend references.
- IDs and serialized record sizes must be bounded and validated.
- Failures must not result in partial mission records. PostgreSQL adapter writes must use transactions.
- Deterministic ordering: createdAt ascending, then mission ID ascending.
- Migration management remains a separate explicit workflow; application startup must not implicitly migrate.

## Backend conformance suite

The same tests should run against temporary filesystem storage and an isolated PostgreSQL test schema when a PostgreSQL test environment is available:

1. init is idempotent.
2. create/get round trip preserves the record.
3. duplicate create rejects.
4. save rejects missing record and updates existing record.
5. get/list return copies (mutating returned values cannot mutate storage).
6. list order is deterministic.
7. malformed records are rejected.
8. invalid IDs are rejected without path/query injection.
9. concurrent create/save operations do not corrupt records.
10. adapter errors are propagated without exposing credentials or sensitive internals.
11. owner-scoped adapter methods (if introduced) cannot return another owner's record.
12. PostgreSQL transactional rollback prevents partial writes.

## Existing implementation status and limitations

- Filesystem implementation: currently implemented in `server/mission-store.js`; atomic temp-file rename is used for writes, with a process-local serialization queue.
- PostgreSQL: schema exists in `server/storage/migrations/001_missions.sql`; no adapter is identified in the inspected runtime. The migration CLI requires explicit environment authorization.
- Current API performs owner checks after general get/list calls. This is not sufficient to claim database-enforced tenant isolation or multi-process concurrency safety.
- Process-local queue and worker active-set are not distributed locks. Multiple instances require atomic claims, owner-scoped access, optimistic concurrency or locking, and recovery rules.

## Sequenced implementation gates

1. Refactor filesystem store against this interface without changing API behavior.
2. Add reusable adapter conformance tests and run them against filesystem storage.
3. Implement PostgreSQL adapter with transactionality and owner-scoped operations.
4. Add PostgreSQL conformance tests using a dedicated isolated test database; never run tests against production.
5. Integrate adapter selection/configuration only after parity, security review and deployment configuration are verified.
6. Add recovery/claim/lease mechanics separately, including stale-running detection and retry limits.

## Evidence labels

This file is a design contract. It does not mean PostgreSQL integration, multi-instance locking, tenant isolation, recovery or production validation have been implemented.
