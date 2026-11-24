# BAYE v6.2 — Signed lifecycle evidence authorization

## Scope

This module creates an authorization callback compatible with the v6.0 recovery-evidence writer. It verifies a host-signed HMAC-SHA256 envelope and binds the signature to the exact owner, mission, task, and safety-evidence fields being written.

## Security contract

- The host lifecycle service signs the normalized payload using a key of at least 32 bytes.
- The envelope contains a key ID, millisecond timestamp, unique nonce, and 64-character lowercase hexadecimal HMAC.
- Verification uses a bounded clock window and constant-time signature comparison.
- The nonce store must atomically consume (keyId, nonce) exactly once. A PostgreSQL implementation should enforce a unique constraint and expiry cleanup; a non-atomic read-then-write implementation is not acceptable.
- Unknown keys, malformed payloads, invalid signatures, stale/future timestamps, replayed nonces, and nonce-store failures are denied.
- Signing keys must be provisioned and rotated by the host secret-management process. Never place keys in client code, task payloads, logs, or recovery-worker credentials.

## Integration

Pass the returned function as authorizeLifecycleEvent to createMissionTaskRecoveryEvidenceWriter. The event passed to the writer must include authEnvelope alongside the exact evidence fields being persisted. The signing service must derive the signed fields from authenticated lifecycle observations, not user-supplied claims.

The nonce store is an explicit integration dependency. This PR does not create its PostgreSQL table, provision keys, authenticate HTTP callers, or wire the verifier into production routes. A production integration must implement durable atomic nonce consumption and test replay behavior against PostgreSQL before activation.

## Limits

HMAC proves that an entity holding the shared secret signed these exact fields; it does not independently prove that the observations are true. Protect and isolate the signer, verify mission/task authorization before signing, rotate keys safely, and retain audit records. No task execution, recovery loop, merge, or deployment is included.
