# BAYE v3.5 — Connected Persistent Intelligence

Authenticated orchestration requests now use server-side persistent mission memory.

- `POST /api/orchestration/run` accepts an optional bearer identity token.
- Requests without Authorization retain existing anonymous behavior and client-carried memory.
- A supplied bearer token must validate; invalid credentials never downgrade to anonymous.
- The verified token subject is the sole owner identifier.
- With a `missionId`, BAYE loads that owner's saved packet before specialist execution.
- Successful missions save updated memory under the same owner and mission ID.
- New authenticated missions receive a generated ID, returned in `missionMemory.missionId`.
- Authenticated callers cannot inject `priorMemory`.
- Failed missions are not persisted.
- Memory-load failure stops execution before model calls. Save failure preserves the completed result and reports `memoryPersistence.status = unavailable`.

## API
First authenticated mission: send tasks and optional reviewMode to `POST /api/orchestration/run` with a trusted bearer token. Save the returned `missionMemory.missionId`.

To continue, send that missionId and new tasks with a valid token for the same user. BAYE retrieves continuity from server storage.

## Boundaries
No login or token issuer is added. A trusted issuer and `BAYE_IDENTITY_SECRET`, `BAYE_IDENTITY_ISSUER`, `BAYE_IDENTITY_AUDIENCE` must be configured. Anonymous calls do not receive server-persisted continuity. The JSON store remains single-process and requires a mounted persistent disk; it is not safe for multiple gateway instances. No autonomous learning, external actions or fact verification are introduced. No production settings or secrets are changed.

Tests cover owner-scoped continuity, fail-closed load behavior, save failures and non-persistence of failed missions.