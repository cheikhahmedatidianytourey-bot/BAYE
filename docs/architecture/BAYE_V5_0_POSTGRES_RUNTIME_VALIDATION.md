# BAYE v5.0 — PostgreSQL runtime validation

This stacked, opt-in change adds environment-gated integration tests for the coordinated task executor against a real PostgreSQL pool.

## Coverage
- Executes a task longer than the initial lease and verifies periodic renewal and accepted completion settlement.
- Uses the persisted claim inspection to confirm terminal status.
- Verifies that a second adapter cannot invoke its worker while a real active claim is held by another claimant.
- Uses unique owner and mission identifiers and cleans up rows in a finally block.

## Running
Set `BAYE_TEST_DATABASE_URL` to a dedicated test PostgreSQL database, then run:

```sh
node --test tests/coordinated-task-executor-postgres.integration.test.js
```

The tests skip when the variable is absent. Use only a dedicated test database; the test creates the coordination table if absent and deletes only its unique test rows.

## Scope and safeguards
This is test-only integration validation. It does not connect the production runtime, create a production database, configure secrets, change Render, deploy, or enable public execution. It does not claim exactly-once external effects or full recovery after process crashes.
