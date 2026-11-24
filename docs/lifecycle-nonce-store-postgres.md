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
- Tests in this PR use a query stub; they are not a live PostgreSQL integration test. Validate against a disposable PostgreSQL instance before operational use.
