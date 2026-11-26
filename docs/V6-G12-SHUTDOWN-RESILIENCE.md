# BAYE V6 G12 — Runtime shutdown resilience

- Centralized graceful shutdown with a bounded wait for HTTP close.
- Idempotent shutdown coordination prevents duplicate signal paths from closing storage repeatedly.
- Storage closure is attempted even if HTTP close fails or times out.
- On HTTP close timeout/error, force-closes active HTTP connections when the Node server exposes that method.
- This change does not alter backend selection, enable PostgreSQL, migrate data, or deploy.
- CI covers shutdown ordering, idempotency, timeout, forced connection cleanup and error paths.
