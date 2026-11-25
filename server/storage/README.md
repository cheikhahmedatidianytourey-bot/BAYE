# BAYE G1 persistence foundation

This folder defines the initial PostgreSQL persistence boundary for Phase G1. This commit introduces the database schema and implementation contract only; it does not yet replace MissionStore or configure production database access.

## Safety and rollout

- PostgreSQL access must be explicitly configured; no implicit connection or migration at server startup.
- The database must be dedicated to BAYE. Do not reuse VEZTEMAD resources.
- Tenant-aware operations must always include owner identity in repository-level queries.
- Migrations are versioned and applied deliberately by a separate command/operator workflow.
- Filesystem storage remains the active store until integration tests, migration tooling, backup/restore and deployment checks are completed.

## Contract for the next implementation commit

A mission repository should expose tenant-aware methods (rather than API-level filtering):

- create(ownerId, mission)
- get(ownerId, missionId)
- list(ownerId, options)
- save(ownerId, mission, expectedVersion)

Use transaction boundaries for state changes and checkpoint updates. Optimistic concurrency must reject stale writes. The repository must not return records belonging to a different owner; cross-tenant lookups should return the same not-found result as nonexistent IDs.

The SQL migration below is a foundation for durable mission and task storage. Further migrations and tests are required before runtime adoption.
