# BAYE V6 Phase G — Core Architecture Direction

## Status

Architecture decision record and implementation boundary for Phase G. This document does not claim that PostgreSQL persistence, distributed execution, native media generation, or photorealistic quality are implemented.

## CI validation

Pull requests targeting `baye-v6-phase-f-multi-tenant-isolation` are included in the repository's BAYE CI workflow. The expected checks are backend tests (`npm test`) and frontend build (`npm run build`).

## Product objective

BAYE AI CORE is intended to become a multimodal intelligence and execution platform. The long-term engine must coordinate reasoning, planning, specialized agents, durable memory, controlled tools, independent verification, and image/video creation. Media generation is a first-class workload, not an unrelated add-on.

The architecture must distinguish:
- implemented code;
- behavior covered by automated tests;
- externally configured provider capability;
- deployed and operational capability;
- future research and product objectives.

## Current verified baseline on Phase F

- Mission records use one JSON file per mission through `MissionStore`.
- Mission mutations are serialized only inside one Node.js process.
- `MissionWorker` uses an in-memory active set; this is not a distributed lock.
- Mission API authenticates users and filters ownership at the API layer.
- `MemoryEngine` uses a JSON file and process-local mutation queue.
- Image generation has a Cloudflare Workers AI adapter.
- Video generation submits jobs to a fal.ai queue and exposes a status endpoint.
- The media adapters do not establish photorealistic fidelity, physical correctness, temporal consistency, or scene continuity.
- The repository package manifest currently has no PostgreSQL client dependency.
- No BAYE-specific Render PostgreSQL instance or verified Render service configuration was established during this inspection. The existing VEZTEMAD database is a separate project and must not be reused for BAYE.

## Target architecture

```
Client / API Gateway
        |
Identity, tenant policy, quotas and consent
        |
BAYE Core Orchestrator
  |       |        |         |
Planner  Memory   Agent     Media Orchestrator
  |       |        |         |
Task graph / durable job state / policy checks
        |
Tool adapters and model/provider adapters
        |
Independent verification, audit and result delivery
```

The orchestrator should depend on stable interfaces, not on a single model vendor or storage implementation.

## Phase G implementation sequence

### G1 — Durable mission persistence
- Introduce a PostgreSQL-backed mission repository behind the existing store contract.
- Use migrations with explicit schema versions.
- Store tenant ownership as a non-null, indexed field.
- Make create, state transition, checkpoint and task update transactional.
- Add database-level tenant-scoped reads and writes; API filtering alone is insufficient.
- Keep the filesystem store only as a development/test adapter until a deliberate migration is validated.
- Do not silently switch production storage until schema, backups, migration, rollback and deployment configuration are verified.

### G2 — Distributed worker coordination
- Claim work atomically using row locks or an equivalent database claim protocol.
- Use leases with owner identity, expiry, heartbeat and monotonically increasing fencing tokens.
- Every completion write must verify the current lease/fencing token so an expired worker cannot overwrite newer work.
- Define retry/backoff, idempotency and recovery semantics.
- Test simultaneous workers, lease expiry, stale-worker completion, process restart and partial failure.
- Do not describe the worker as multi-instance safe until these tests pass.

### G3 — Durable memory and knowledge
- Move user memory behind a tenant-scoped repository.
- Separate short-lived conversation context, durable user memory, project knowledge and indexed reference material.
- Add retention, deletion, provenance and access-control rules.
- Consider vector search only after data boundaries, evaluation and retrieval quality are specified.

### G4 — Multimodal generation as a first-class subsystem
- Define a provider-neutral job contract for text-to-image, image-to-image, text-to-video and image-to-video.
- Persist generation requests, provider job IDs, status, retries, costs/quotas, output metadata and ownership.
- Add provider capability discovery and explicit routing/fallback policies; never trigger a paid fallback without configured policy and user authorization.
- Support prompt expansion, reference assets, aspect ratio, duration, camera/motion controls and scene continuity where providers expose them.
- Treat nature fidelity as an evaluated objective: anatomy, botanical structure, water/fluids, lighting, shadows, materials, motion, weather and physical consistency.
- Add evaluation datasets and human review. Do not claim photorealistic quality from provider availability alone.
- Preserve provenance and safety checks for generated and uploaded assets.

### G5 — Verification and learning loop
- Add task-specific validators and independent review stages.
- Record structured feedback and quality metrics with tenant boundaries.
- Use feedback to evaluate model/provider/prompt changes; do not let production agents modify their own policies or deploy code without review and explicit authorization.

## Security and operational requirements

- Secrets are supplied only through the deployment secret manager and never committed.
- Tenant isolation is enforced in repository methods and database constraints/policies where appropriate.
- Database connections use bounded pools and timeouts.
- Jobs are idempotent and have explicit resource/time limits.
- Provider costs and quotas are enforced before submission.
- Sensitive prompts, assets and outputs follow documented retention and deletion rules.
- Migrations are backward-compatible where possible and include a rollback or forward-recovery plan.
- Observability records correlation IDs and safe operational metadata without leaking tokens or private content.

## Acceptance gates

Phase G is not complete until:
1. migrations can create the schema on a clean PostgreSQL database;
2. repository tests prove tenant isolation for every read/write operation;
3. transactional state transitions reject invalid or stale updates;
4. concurrent-worker tests prove single-claim behavior and fencing;
5. recovery tests cover crashes and expired leases;
6. CI runs unit, integration and build checks;
7. deployment configuration points only to a dedicated BAYE database and has verified backup/restore procedures.

## Explicit non-goals for this phase

- No production database is created or modified by this PR.
- No existing VEZTEMAD database is reused.
- No PR is merged and no service is deployed.
- No claim is made that BAYE currently trains its own foundation model or independently guarantees natural-looking media.
