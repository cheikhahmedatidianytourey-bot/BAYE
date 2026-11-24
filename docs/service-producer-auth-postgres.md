# BAYE v6.8 — PostgreSQL-backed service producer authentication

## Objective

Connect the v6.7 service-producer authenticator to the existing durable PostgreSQL nonce adapter and prove replay prevention against a real PostgreSQL 16 instance.

## Integration

The authenticator accepts the existing `createPostgresLifecycleNonceStore({ pool })` adapter as its `nonceStore`. The adapter persists the tuple `(key_id, nonce)` in `baye_lifecycle_nonces`; v6.7 namespaces `key_id` with both service ID and key ID, so distinct producers and rotated keys do not share a nonce namespace.

No new migration is required. This version reuses `migrations/0063_lifecycle_nonce_store.sql`.

## PostgreSQL integration proof

The integration test runs only when `BAYE_TEST_DATABASE_URL` points to a local disposable test database. It creates a unique schema, applies migration 0063, and drops the schema during cleanup.

The test verifies:

- 32 concurrent authentications of the same signed request produce exactly one authenticated principal.
- A replay remains rejected after closing and reconnecting the PostgreSQL pool.
- The same nonce can be independently consumed under a distinct key ID, matching the key-rotation namespace contract.
- A missing nonce table causes authentication to fail closed.

The repository CI PostgreSQL service supplies the disposable PostgreSQL test database. The test must execute, not be skipped, in CI.

## Boundaries

This validates the authenticator-to-PostgreSQL nonce-store integration in a disposable CI database. It does not wire middleware into a production HTTP route or gateway, provision production service accounts or secrets, apply migrations to a production database, establish production grants, or deploy the service. HMAC still proves possession of a configured shared secret and request integrity, not the factual truth of submitted lifecycle observations. TLS, secret storage, per-mission authorization, rate limiting, and operational key rotation remain host responsibilities.
