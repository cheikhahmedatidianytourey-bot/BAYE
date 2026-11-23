# BAYE v5.6 — Recovery input contract

The recovery envelope validator centralizes strict input validation and normalization before policy evaluation.

- Requires explicit boolean safety signals; no permissive defaults.
- Bounds recovery budgets and validates namespace/task/worker/idempotency identifiers.
- Returns a frozen normalized envelope.
- Validation does not authenticate provenance, read durable metadata, validate checkpoint contents, execute work, or perform atomic claims. Those remain responsibilities of trusted upstream systems and the coordination store.
- The lease duration is passed through and validated by the existing claim store; this validator does not duplicate that enforcement.

