# BAYE v3.4 — Authenticated Identity Boundary for Mission Memory

This change adds a verifier for externally issued, short-lived HS256 identity tokens and protects the persistent mission-memory API with the verified subject claim.

## Required environment
Configure all three values on the trusted identity-verification service:
- `BAYE_IDENTITY_SECRET`: random secret of at least 32 bytes, shared only with the trusted token issuer.
- `BAYE_IDENTITY_ISSUER`: exact expected `iss` claim.
- `BAYE_IDENTITY_AUDIENCE`: exact expected `aud` claim (for example `baye-api`).

No token-issuance endpoint is added. BAYE does not issue identities, accept a user ID from the request body, or treat the old shared memory token as a user identity.

## Token contract
A compact JWT with `alg=HS256`, `typ=JWT`, exact issuer and audience, a subject matching the bounded owner-ID format, integer `iat` and `exp`, and a lifetime no longer than one hour. Optional `nbf` is enforced. Signature comparison is constant-time.

## Protected API
- `GET /api/orchestration/memory/:missionId`
- `PUT /api/orchestration/memory/:missionId` with `{ "memory": <validated mission-memory packet> }`
- `DELETE /api/orchestration/memory/:missionId`

The owner is always taken from the verified token subject. A caller cannot select another owner. Memory packets remain mission-scoped and are validated before persistence.

## Limits
- This verifies tokens from a trusted issuer; it does not implement account registration, login, password storage, OAuth, key rotation, or refresh tokens.
- HS256 means issuer and verifier share a secret. Use a dedicated high-entropy secret and never expose it to browsers.
- The file store remains single-process only and requires a mounted persistent disk. Do not horizontally scale this JSON store.
- Until a trusted identity issuer and these environment values are configured, the endpoints return 503 and fail closed.
- No production secrets or Render settings are changed by this PR.
