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


## BAYE Engine — universal capability and evolution strategy

The engine is designed to support a broad and continually expanding capability surface through interchangeable adapters and a capability registry—not by assuming one provider or model can do everything.

### Capability families to accommodate
- **Language and reasoning:** conversational, instruction following, structured output, long-context tasks, multilingual tasks, reasoning/planning profiles where provider APIs expose them.
- **Research and knowledge work:** web/search adapters, retrieval, citations, document parsing, synthesis and fact-check workflows.
- **Software engineering:** code generation, repository inspection, patch planning, test execution in controlled environments, debugging and review.
- **Data and analysis:** structured data ingestion, calculations, analysis, visualization and file export through safe tools.
- **Image:** text-to-image, editing, variations, reference-image conditioning and image understanding.
- **Video:** text/image-to-video, clip editing or transformations where supported, temporal/scene continuity controls and evaluation.
- **Audio and voice:** speech recognition, transcription, text-to-speech, voice interaction, audio understanding and audio generation where adapters support them.
- **Multimodal input/output:** combinations of text, images, audio, video and files within one task, subject to model and provider limits.
- **Agentic execution:** bounded task decomposition, agent delegation, tool execution, checkpoints, result verification and recovery.
- **Future specialized capabilities:** new model modalities, spatial/3D, simulation or other interfaces as they mature, without destabilizing the core.

### Capability registry and model router
Maintain a versioned registry describing each adapter/model's supported operations, modalities, context/output limits, tool support, latency characteristics, availability, quality evaluation results, pricing metadata, policy restrictions and version identifiers. Metadata must be sourced and refreshed; unknown capabilities remain unknown.

Routing should select a provider/model by task requirements, user-selected quality/speed/cost profile, verified capability, policy, quota and availability. Never route based solely on marketing claims or a model name. The user-facing engine should abstract provider-specific APIs and preserve portable task/result formats.

### Provider lifecycle and upgrades
- Keep adapter contracts and conformance tests versioned.
- Add new providers/models behind adapters; do not couple mission logic to vendor-specific formats.
- Track deprecations, API changes, model version changes and compatibility.
- Use staged rollouts, regression evaluations and rollback-ready configuration.
- Permit configured fallback only within explicit budget, privacy, safety and user-consent constraints.
- Offer profile controls such as balanced, quality-first, speed-first and cost-conscious, with transparent tradeoffs and no false guarantees.
- Store provider/model/version provenance per task to support debugging and evaluation.

### Engine execution pipeline
1. Parse the request and attachments; classify intent, modalities, constraints and risk.
2. Build a task plan and choose required capabilities.
3. Check permissions, privacy boundaries, budgets and resource limits.
4. Route subtasks to qualified adapters and/or specialized agents.
5. Execute with durable checkpoints, bounded retries and cancellation.
6. Verify outputs using independent checks where practical; mark uncertainty and failures.
7. Deliver the result with provenance, status and optional user feedback.
8. Record privacy-safe evaluation signals for future quality improvement; updates require review and controlled rollout.

### Acceptance principle
BAYE should be extensible to future AI modes, but must not claim it can operate every current or future AI capability automatically. Each capability is considered available only after its adapter, configuration, permission controls, evaluation and operational checks are implemented and verified.

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
