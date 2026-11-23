# BAYE v5.1 — Expired claim recovery validation

This stacked, opt-in change extends the PostgreSQL integration suite with an expired-claim recovery and fencing-token test.

## Coverage
- Claims a task with a short lease and waits for expiry.
- Reclaims the task using the same idempotency key and verifies the fencing token advances.
- Confirms the stale claimant cannot settle the task after reclamation.
- Confirms the current claimant can settle successfully.
- Cleans up only its unique test rows in a finally block.

## Running
Set `BAYE_TEST_DATABASE_URL` to a dedicated test PostgreSQL database and run:

```sh
node --test tests/coordinated-task-executor-postgres.integration.test.js
```

The integration tests skip when the environment variable is absent. Do not use production databases.

## Scope
Test-only validation; no production runtime wiring, database provisioning, secret changes, Render changes, deployment, or public execution activation. Fencing protects coordination settlement, not external side effects already performed by a stale worker.
