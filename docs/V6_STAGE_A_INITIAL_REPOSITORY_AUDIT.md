# BAYE V6 — Stage A repository audit (initial evidence)

**Status:** partial repository audit, evidence captured 2026-11-26. This is not a full tree-wide audit or a runtime validation.

## Evidence inspected
- `package.json` on `main`: Node 24.x; `npm test` runs `node --test`; `npm run build` runs Vite; server start is `node server/index.js`. Dependencies currently listed include React, Express, CORS, express-rate-limit and Vite.
- `README.md` on `main`: describes Studio, Academy, Motion, Sentinel and a memory foundation. It states external inference providers are configured and explicitly labels live research, coordinated agents, authorized tools, accounts, durable history and payments as development goals rather than available capabilities.
- `server/baye-core.js` on `main`: contains identity/doctrine/guardrails and describes BAYE as a software orchestration layer, not a trained foundation model. This fetch inspected only an initial portion of the file.
- PR #67: architecture and target gates for scalable core, persistence, worker leases/fencing, durable memory and first-class media; documentation only.
- PR #68: PostgreSQL persistence foundation with migration draft and tenant-scoped repository, but runtime still uses filesystem MissionStore; no live DB, migration, integration tests or provisioned database claimed.
- PR #69: provider-neutral orchestrator foundation with injected planner/executor/policy, plan validation, dependency ordering and sequential execution. No runtime integration, durable worker, provider routing, sandbox, recovery or deployment claimed.
- PR #70: execution audit, hard bounds, adversarial tests and CI workflow. The PR body was inspected; detailed source review remains incomplete.
- PR #71: initial verification scenario harness, bounded reporting and generated graph cases. Source and documentation were inspected. Timeout bounds reporting but cannot forcibly cancel scenario side effects.
- PR #72: vision-aligned roadmap. PR metadata and document inspected; it is a roadmap, not capability delivery.
- GitHub Actions: validation run #6 for commit `3ee5f62708d6ea2187f1bc0f85b794114926c8f4` reported success; run #5 for `c1338a1e54bcf7a432fd43ac96ca0840ece69cbf` reported success. These results do not validate runtime, production, PostgreSQL, providers or deployments.

## Evidence-based capability status

| Capability | Current evidence | Gap / next gate |
|---|---|---|
| Web product/backend baseline | README and package manifest inspected | Full runtime and UX audit; live endpoint checks |
| Mission validation | PR #70/#69/#71 code and documentation evidence | audit all runtime call sites and tests |
| Orchestration | PR #69 foundation | runtime/API integration, provider registry, bounded concurrency, durable coordination |
| Persistence | PR #68 draft adapter/schema | contract normalization, adapter tests, tenant boundary tests, live PostgreSQL validation, migration/restore gates |
| Verification | PR #71 scenario harness; CI run #5 successful | isolation from timed-out work, production-like integration/chaos suites, structured artifacts |
| Image/video generation | README says provider-based interface/configuration | inspect actual provider adapters, job lifecycle, storage, polling, result rendering and fidelity evaluations |
| Memory | README describes private server-side foundation | inspect retention, access controls, durable integration, provenance and user lifecycle |
| Security | doctrine and some tests/architecture gates | threat model, end-to-end auth/authorization, injection, sandbox and secrets audit |
| Deployment | not verified in this audit | inspect Render health, logs, deployments and runtime behavior separately |

## Priority implementation order
1. Finish repository inventory and map current runtime/API/provider/media/memory/security modules, interfaces, tests and live dependencies.
2. Establish a canonical mission-store adapter contract and conformance suite before integrating PostgreSQL or multiple workers.
3. Integrate orchestration into a bounded mission runtime behind explicit policy and capability gates; preserve the existing path until tested.
4. Add controlled execution, worker claim/lease/idempotency and recovery tests before enabling distributed execution.
5. Audit and connect image/video provider job lifecycle end-to-end, with real integration tests and transparent provider status.
6. Verify runtime/deployment and release readiness; only deploy with explicit approval.

## Audit limitations
This initial audit used a small set of file reads and PR metadata. It did not enumerate every repository file, inspect every PR diff, run tests locally, validate a live database, or probe Render endpoints. Those are pending audit items, not assumed successes.
