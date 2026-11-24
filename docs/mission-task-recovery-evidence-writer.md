# BAYE v6.0 — Trusted lifecycle evidence writer

This isolated writer records recovery safety evidence only after the host-provided lifecycle authorization callback returns exactly true. Authorization must be implemented by a trusted server-side lifecycle service; do not expose this callback or writer to user input or recovery-worker requests.

- Validates hashed owner scope, mission/task identifiers, boolean safety flags, and bounded retry counts.
- Writes through parameterized PostgreSQL SQL.
- Uses an atomic upsert and monotonically increments evidence revision on subsequent writes.
- Does not authorize by itself, prove provenance cryptographically, execute tasks, or run recovery.
- The recovery-worker database role must not be granted INSERT/UPDATE/DELETE on the evidence table. Use separate lifecycle credentials and enforce access controls outside this module.
- Evidence updates must reflect actual task lifecycle/checkpoint/side-effect observations, not assumptions or optimistic claims.

The authorization callback is an integration seam, not a production authorization implementation. Database integration tests and production wiring remain separate validation steps.
