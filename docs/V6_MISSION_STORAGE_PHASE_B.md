# V6 Phase B — Durable Mission Storage

Phase B adds a filesystem-backed durable record store, one JSON record per mission, atomic replacement writes, safe mission IDs, schema validation on reads/writes, and serialized mutations within one Node.js process.

## API
- `new MissionStore({directory})` / `createMissionStore({directory})`
- `init()`: creates the directory
- `create(mission)`: create-only; rejects duplicate IDs
- `get(id)`: read one validated record or `null`
- `save(mission)`: replace an existing validated record
- `list()`: return validated records sorted by creation time

## Important limits
This store is durable across process restarts when its directory is on persistent storage. It is **not** a multi-process/distributed lock or database: concurrent writers from multiple service instances can conflict. Production deployment should use a persistent disk and single-writer arrangement, or transition to a transactional database before multi-instance scaling. No global mission-duration or task-count limit is introduced.

This phase does not yet add worker leases, scheduling, API endpoints, retries, or deployment wiring.
