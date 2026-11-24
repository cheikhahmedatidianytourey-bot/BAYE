# BAYE v6.6 — Atomic PostgreSQL lifecycle evidence recorder

## Objective

Connect the v6.2 HMAC authorization, v6.3 durable single-use nonce store, and v6.0 lifecycle evidence writer through one PostgreSQL transaction.

## Transaction contract

`createPostgresLifecycleEvidenceRecorder({ pool, keys, now, maxAgeMs })` requires a PostgreSQL pool exposing `connect()` and a host-managed signing-key map. For each event it:

1. Acquires one database client and begins a transaction.
2. Verifies the signed event using the v6.2 HMAC authorizer.
3. Consumes the (key ID, nonce) through the v6.3 PostgreSQL adapter using that same transaction client.
4. Writes the validated lifecycle evidence through the v6.0 writer using the same client.
5. Commits both writes together; on any failure it attempts rollback and rethrows the original error.

This prevents a successful nonce consumption from being committed separately from its corresponding evidence write. A failed evidence write rolls back the nonce insert, allowing the exact still-valid signed event to be retried. Concurrent duplicate envelopes are serialized by the nonce table's unique key; only one transaction can commit the event.

## Validation

The unit tests exercise transaction boundaries and failure propagation with a deterministic query stub. The PostgreSQL integration test uses only `BAYE_TEST_DATABASE_URL`, requires localhost and a clearly named test database, creates a unique temporary schema, applies migration 0063, creates an isolated evidence-table fixture matching the v6.0 writer contract, and drops the schema afterward.

The integration test checks successful persistence, replay rejection, rollback and retry after an evidence-table failure, and concurrent duplicate-envelope handling.

## Security and operational boundaries

- Keep signing keys in host-managed secret storage; never expose them to clients or recovery workers.
- HMAC proves possession of the signing key and integrity of the signed fields; it does not prove the underlying observations are true.
- The trusted signer must derive evidence from authenticated lifecycle observations.
- This adapter is not wired to an HTTP route or production service and does not authenticate callers, provision database roles/credentials, or execute/recover tasks.
- CI integration evidence is not production deployment evidence. Apply least-privilege role and schema grants separately before any controlled deployment.
