# v6.3 — PostgreSQL durable nonce store

This module provides an atomic, durable single-use nonce store for the v6.2 signed lifecycle-evidence verifier.

## Setup
1. Apply `migrations/0063_lifecycle_nonce_store.sql` with a privileged migration account.
2. Give the service account only the permissions it needs on this table (INSERT; avoid broader access where possible). Provision credentials outside the repository.
3. Instantiate `createPostgresLifecycleNonceStore({ pool })` with the PostgreSQL pool and pass the returned store as the verifier's `nonceStore`.
4. Configure a separate retention task to delete rows whose `expires_at` is safely in the past. Do not delete nonces before their replay protection window ends.

## Contract
- The composite primary key makes concurrent attempts to consume the same (key_id, nonce) race safely: only one INSERT returns a row.
- SQL uses bound parameters.
- Storage errors propagate to the verifier, which is expected to fail closed.
- This module does not provision PostgreSQL, credentials, roles, production wiring, or retention jobs.
- Unit contract tests use a query stub. The v6.4 integration suite additionally runs against the disposable PostgreSQL 16 service configured in CI when `BAYE_TEST_DATABASE_URL` is present. It creates an isolated temporary schema, applies the migration there, checks 32 concurrent attempts for exactly one successful consumption, verifies replay rejection after reconnecting with a new pool, and confirms database errors propagate. The suite refuses non-local hosts and database names that do not identify a test database.
- The integration suite does not validate production credentials, production role grants, a deployed retention job, application route wiring, or a live production database. Never point `BAYE_TEST_DATABASE_URL` at production.
