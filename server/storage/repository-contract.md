# Tenant-scoped repository contract

The G1 PostgreSQL implementation must preserve Mission Engine validation and transitions while moving ownership enforcement into the repository.

## Required invariants

1. owner_id is required for every mission operation; no unscoped get/list/save method is exposed to request handling.
2. All query predicates for mission access include both owner_id and mission_id.
3. Mission record and task rows update atomically within one transaction.
4. save requires an expected version; stale versions produce a concurrency conflict.
5. Task rows are derived from validated mission data and updated in the same transaction as the mission record.
6. A migration runner must verify applied versions, apply migrations in order and never run automatically on service startup.
7. Tests must cover tenant isolation, duplicate creation, stale writes, transaction rollback, migration on an empty database and consistency of mission/task rows.

## Deliberate boundary

The schema is an initial design, not a verified production database schema. Runtime integration, migration runner, SQL driver dependency, tests and operational procedures remain outstanding.
