# BAYE V6 Phase F — per-user mission isolation

Phase F replaces the Phase D shared bearer token with a fail-closed per-user token registry and scopes every mission operation to the authenticated principal.

## Configuration

Configure `BAYE_MISSION_USER_TOKENS` as a JSON array of SHA-256 token hashes and stable user IDs:

```json
[
  {
    "tokenHash": "64-character-lowercase-sha256-hex-digest",
    "userId": "stable-user-account-id"
  }
]
```

- Issue a separate cryptographically random bearer token to each user (at least 32 characters; maximum 512).
- Store only the SHA-256 digest in `BAYE_MISSION_USER_TOKENS`; deliver the raw token securely to its user and never commit it.
- A user ID must be stable, unique to the account, and contain only letters, digits, underscores, or hyphens (1–128 characters).
- The registry accepts 1–1000 records and rejects malformed JSON, duplicate token hashes, weak hashes, and unsafe user IDs.
- The gateway returns 503 for mission API requests when the registry is not configured. The old `BAYE_MISSION_TOKEN` is intentionally not accepted as a tenant identity.
- Hash helper: import `hashMissionToken` from `server/mission-auth.js` in a trusted local admin script to compute the digest for a newly issued token. Do not print or log bearer tokens in CI or application logs.

## Isolation guarantees

- Mission creation stores the authenticated principal's `userId` as `ownerRef`.
- List operations return only missions owned by that principal.
- Read and run operations return 404 for a mission owned by another principal, avoiding cross-tenant existence disclosure.
- Worker execution is reached only after the owner check.
- Public mission responses continue to use an explicit field allowlist.

## Existing mission records

Records created by the previous shared-token API may have `ownerRef: "api-user"`. They are preserved on disk but are not automatically assigned to any new user. Do not bulk-assign them. Before any migration, establish the rightful owner for each legacy record and perform a separately reviewed, backed-up migration.

## Deployment and operational limitations

- Set `BAYE_MISSION_USER_TOKENS` in the deployment secret/environment manager before enabling mission access. The previous `BAYE_MISSION_TOKEN` setting alone is no longer sufficient.
- Keep the persistent disk mounted at `/var/data` when using the default mission directory.
- Phase F provides per-user identity and application-level ownership checks; it does not yet provide a full registration/login system, token rotation/revocation endpoint, or an external identity provider.
- The filesystem store and worker lock remain single-process. The worker's in-memory active set does not coordinate multiple Render instances. Multi-instance execution requires a transactional database and distributed lease/fencing design; it is not claimed by this phase.
- No merge or deployment is performed by this change. CI must pass and the PR must be reviewed first.
