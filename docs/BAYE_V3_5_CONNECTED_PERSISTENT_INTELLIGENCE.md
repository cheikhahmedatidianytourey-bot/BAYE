# BAYE v3.5 — Connected Persistent Intelligence

## What changed
Authenticated orchestration requests now use the server-side persistent mission-memory store for continuity.

- `POST /api/orchestration/run` accepts the existing optional bearer identity token.
- Requests without an Authorization header keep the existing anonymous, client-carried memory behavior.
- If a bearer token is supplied, it must validate. Invalid credentials never fall back to anonymous mode.
- The verified token subject is the only owner identifier passed to the memory store.
- For an authenticated request with a `missionId`, BAYE loads that owner's saved packet before starting specialist execution.
- A completed mission saves its new packet under the same verified owner and mission ID.
- A new authenticated mission without a `missionId` gets a generated mission ID; the response includes it in `missionMemory.missionId`.
- Authenticated callers cannot inject `priorMemory`; continuity is loaded only from server storage.
- Failed missions are not persisted.
- A memory-load failure stops the mission before any model calls. A save failure does not erase a completed mission result; the response reports `memoryPersistence.status = unavailable`.

## API examples

First authenticated mission:
```http
POST /api/orchestration/run
Authorization: Bearer <trusted-identity-token>
Content-Type: application/json
```
Body contains `tasks` and optional `reviewMode`. The response contains `missionMemory.missionId` and `memoryPersistence`.

Continue the same mission:
```http
POST /api/orchestration/run
Authorization: Bearer <same-user-identity-token>
Content-Type: application/json
```
Body contains `missionId` from the prior response and new `tasks`. BAYE loads the memory belonging to the authenticated subject and that mission ID.

## Security and operational boundaries
- The client cannot select an owner or submit prior memory in authenticated mode.
- The identity token must be issued by a separately trusted issuer using the configured HS256 secret, exact issuer and audience, and a maximum one-hour lifetime.
- No login/registration/token-issuance system is implemented here.
- Anonymous orchestration remains supported and does not receive server-persisted continuity.
- Persistent storage is still an atomic JSON file, single-process only, with a mounted persistent disk required. It is not safe for multiple gateway instances.
- No automatic learning, global cross-user memory, semantic truth verification, tools, or external actions are introduced.
- No production secrets, Render environment settings, deployment, or branch protection settings are changed.

## Validation
Tests cover authenticated owner-scoped load/save, no memory injection, load fail-closed behavior, save failure reporting, failed mission non-persistence, and optional identity behavior.