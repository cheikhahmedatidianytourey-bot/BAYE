# BAYE V6 G11 — Opt-in PostgreSQL Runtime Selection

## Scope

G11 adds an explicit runtime selector for the mission store. Filesystem storage remains the default. PostgreSQL is selected only when `BAYE_POSTGRES_ENABLED=true`.

## Startup contract

- With the flag absent or any value other than the exact string `true`, BAYE initializes the existing filesystem `MissionStore`.
- With the flag set to `true`, BAYE creates the bounded G10 pool and initializes `PostgresMissionStore`.
- Before the server begins listening, the PostgreSQL adapter checks that the required mission and task tables and columns already exist.
- If pool creation, connectivity, or schema verification fails, startup aborts and the pool is closed. BAYE does not silently fall back to filesystem storage when PostgreSQL was explicitly requested.
- The schema check is read-only. It does not apply or modify migrations.
- Database migrations remain an explicit operator action through `npm run migrate:baye`, requiring `BAYE_ALLOW_MIGRATIONS=true`.
- On SIGTERM or SIGINT, the HTTP server stops accepting requests before the storage lifecycle is closed.

## Configuration

Use the G10 variables:

| Variable | Meaning |
| --- | --- |
| `BAYE_POSTGRES_ENABLED` | Exact value `true` selects PostgreSQL; otherwise filesystem remains active |
| `BAYE_DATABASE_URL` | PostgreSQL connection URL |
| `BAYE_DATABASE_SSL` | Required as `true` for remote PostgreSQL; certificate verification stays enabled |
| `BAYE_PG_POOL_MAX` | Optional pool size from 1 to 20; default 5 |
| `BAYE_MISSION_DIRECTORY` | Filesystem storage directory when PostgreSQL is not enabled |

## Safety boundaries

- This PR changes application code to support an explicit opt-in backend, but it does not enable the flag in any environment.
- No production credentials, database, migrations, deployment, or data movement are included.
- Enabling PostgreSQL requires an operator to provision/configure the database, apply reviewed migrations explicitly, and set the environment flag deliberately.
- There is no automatic fallback from an explicitly requested PostgreSQL backend to filesystem storage, avoiding split-brain or silent data divergence.
- Existing filesystem behavior remains the default.

## Verification

CI runs unit tests, the real PostgreSQL 16 G9 integration suite, and the production build. Unit tests cover default selection, explicit PostgreSQL selection, schema preflight, fail-closed startup, and pool cleanup.
