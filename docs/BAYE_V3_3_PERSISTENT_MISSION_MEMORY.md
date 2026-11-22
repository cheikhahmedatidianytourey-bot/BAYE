# BAYE v3.3 — Persistent Mission Memory Store Foundation

This change introduces a server-side storage primitive for specialist mission continuity. It is deliberately **not wired to the public orchestration route** yet.

## What it provides
- Atomic JSON-file replacement with restrictive file permissions.
- Per-owner namespaces derived from an authenticated owner identifier using SHA-256; raw owner identifiers are not stored.
- Save, load and delete operations scoped to both owner and mission.
- Packet validation through the existing versioned mission-memory validator.
- Configurable retention (default 30 days), bounded record count (maximum 1,000), and bounded file size (4 MiB).
- Serialized mutations within one Node.js process.

## Configuration
Set `BAYE_MISSION_MEMORY_FILE` to a path on a persistent mounted disk (for example `/data/baye-mission-memory.json`). The default path is `/data/baye-mission-memory.json`.

## Important deployment and security limits
- A persistent disk must actually be mounted at the configured path; otherwise redeploys may lose data.
- The store is single-process only and is **not safe for multiple service instances**. Do not scale it horizontally without a transactional shared database or distributed locking.
- The owner identifier must come from a future authenticated server-side identity layer. Never accept a browser-supplied owner identifier as proof of identity.
- The existing public orchestration endpoint has no tenant identity contract. Therefore this PR does not expose save/load APIs or automatically persist user missions. Integration is blocked until authenticated identity and authorization are implemented.
- SHA-256 owner namespacing is not authentication, encryption, or a signature. File permissions are not disk encryption.
- This is a bounded storage primitive, not a claim of long-term memory reasoning or verified recall.

## API (internal module)
```js
const store = new PersistentMissionMemoryStore();
await store.save({ ownerId: authenticatedSubject, memory: missionMemoryPacket });
const saved = await store.load({ ownerId: authenticatedSubject, missionId });
await store.remove({ ownerId: authenticatedSubject, missionId });
```

Tests use temporary directories and do not require provider credentials or external services.
