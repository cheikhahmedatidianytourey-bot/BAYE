# BAYE v5.5 — Recovery claim adapter

This layer connects the conservative v5.4 policy helper to the existing PostgreSQL coordination store's atomic claim API.

- Policy inputs must be supplied from trusted durable state.
- Ineligible tasks are not passed to the claim store.
- Eligible tasks are submitted to the existing atomic claim/upsert; database conditions and fencing-token advancement remain the final concurrency guard.
- A denied claim is reported as a race/eligibility denial, not retried blindly.
- This adapter does not execute tasks, validate checkpoints itself, or prove replay safety.
- PostgreSQL runtime validation remains environment-gated and is not claimed by unit tests.

