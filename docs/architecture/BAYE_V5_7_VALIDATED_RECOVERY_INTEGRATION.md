# BAYE v5.7 — Validated recovery integration

The recovery claim adapter now validates and freezes the complete recovery input envelope before evaluating the conservative recovery policy.

- Malformed identity, retry budget, lease duration, or missing safety booleans fail closed before the store is called.
- The decision helper receives only the normalized envelope.
- Only an eligible decision is delegated to the coordination store's atomic claim operation.
- Store denial remains a denial; this layer does not execute tasks.

## Security boundary

Validation checks shape and bounds, not provenance. Callers must source policy and identity fields from trusted durable state. The store must continue to enforce atomic eligibility, idempotency, lease and fencing rules. This change does not add runtime PostgreSQL verification, worker execution, production wiring, or deployment.
