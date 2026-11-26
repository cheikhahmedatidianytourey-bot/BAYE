# BAYE V6 G10 — PostgreSQL Integration Readiness

## Scope

G10 adds an opt-in PostgreSQL pool factory with bounded defaults, explicit remote TLS, sanitized pool-error reporting, and an idempotent shutdown method. It does not select PostgreSQL as the application's store.

## Safety boundaries

- The application continues to instantiate the filesystem `MissionStore` in `server/index.js`.
- `createPostgresPool()` returns `null` unless `BAYE_POSTGRES_ENABLED=true`.
- No application startup path imports or calls this factory.
- Pool creation never runs migrations. The existing migration CLI still requires `BAYE_DATABASE_URL` and `BAYE_ALLOW_MIGRATIONS=true`.
- Remote database hosts require `BAYE_DATABASE_SSL=true`; TLS certificate verification remains enabled.
- Connection strings must not contain `sslmode`; TLS is controlled by the explicit environment setting.
- Pool size is bounded to 1–20 (default 5); connection, idle, and lifetime limits are set centrally.
- Pool errors expose only a short error code to the callback, never the raw message or connection URL.

## Configuration contract

| Variable | Meaning |
| --- | --- |
| `BAYE_POSTGRES_ENABLED` | Must be exactly `true` to create a pool |
| `BAYE_DATABASE_URL` | PostgreSQL connection URL |
| `BAYE_DATABASE_SSL` | Set to `true` for remote PostgreSQL; certificate verification stays on |
| `BAYE_PG_POOL_MAX` | Optional integer from 1 to 20; default 5 |

These variables are not a production activation instruction. Runtime integration requires a separate reviewed change, deployment plan, migration/rollback procedure, and explicit approval.

## Verification

Unit tests use a fake pool to verify disabled-by-default behavior, URL validation, TLS enforcement, pool bounds, error sanitization, and idempotent shutdown. Real-database verification remains covered by the G9 PostgreSQL 16 integration workflow.
