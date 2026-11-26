# BAYE V6 — Global Readiness Audit (G22)

> Evidence-based snapshot of the G21 stack. This is an engineering triage document, not a claim of product readiness.

## Verified scope and evidence

- The repository has a Node.js 24 / React / Vite / Express application and automated test/build scripts (`npm test`, `npm run build`).
- Existing UI exposes Studio, Academy, Motion, Tools and Profile views.
- The backend includes mission orchestration, safe tool execution/workflows, memory foundations, monitor/health functions, Academy routes, media endpoints and storage lifecycle code.
- Text generation depends on configured external inference credentials. The app does not claim to be a WEMAD-trained foundation model.
- Image generation is implemented through Cloudflare Workers AI adapter (`@cf/black-forest-labs/flux-1-schnell`); credentials are server-side. Real provider behavior, quality and availability still require controlled live tests.
- Video generation is implemented through fal.ai queue integration (`fal-ai/kling-video/v2.1/standard/text-to-video`); live tests, cost and provider configuration remain separate gates.
- G19–G21 add integration/evaluation plans, score foundations and a bounded opt-in benchmark runner. CI/mock tests are not real media quality evidence.
- PostgreSQL adapter and integration tests, lifecycle handling and mission recovery/failure-integrity work are represented in the V6 stack through G21; production deployment evidence must be checked separately.

## Capability status (working classification)

| Area | Status | Next evidence/action |
|---|---|---|
| Frontend shell/navigation | Implemented in repository | Browser/device end-to-end walkthrough |
| Text inference | Integration present | Test real configured provider, error handling, latency and output quality |
| Academy | Route/UI foundations present | Audit all Academy paths and verify end-to-end |
| Image generation | Provider adapter/UI present | Controlled live trial, quality rubric, limits, download and failures |
| Video generation | Queue adapter/UI present | Controlled live trial, polling, failures, timeout, output delivery and cost |
| Mission/orchestration | Foundations and tests present | Exercise representative real tasks end-to-end |
| Safe tools/workflows | Foundations present | Audit tool-by-tool permissions, denial, boundary and misuse tests |
| Memory | Server-side foundation present | Verify persistence, isolation, consent, deletion and user experience |
| PostgreSQL persistence | Adapter/integration groundwork present | Deployment configuration, migrations, failure/backup/restore evidence |
| Monitoring/Sentinel | Implementation present | Validate deployed alerts, observability and incident handling |
| Authentication/accounts | Not confirmed as available in UI | Design and implement if public multi-user service requires it |
| Research/live web citations | Roadmap item | Implement provider integration, attribution and verification |
| Multi-agent coordination | Not confirmed end-to-end | Build bounded specialist agents and orchestration/verification |
| Image/video editing & reference conditioning | Not confirmed fully | Capability inventory and provider-specific integration |
| Cost/quota governance | Partial provider guards | Unified budgets, accounting, rate limits, user disclosure and alerts |
| Security/privacy | Partial safeguards and tests | Threat model, auth isolation, SSRF, abuse, secrets and data-retention audit |
| Load/endurance | No evidence of complete campaign | Run staged, bounded load and endurance tests |
| Public release | Not ready to claim | Release checklist, deployment verification, UX/accessibility and support |

## Immediate critical path (avoid more planning-only PRs)

1. **G23 — End-to-end feature verification:** enumerate actual API routes/UI workflows, test each path against mocks and real configured services where safe, report broken/missing capabilities with reproducible evidence.
2. **G24 — Live media trials (explicitly opt-in):** small, capped image/video trials using configured credentials; collect metadata and human quality assessment without automatically spending money.
3. **G25 — Autonomous task execution hardening:** end-to-end task execution with checkpoints, permission boundaries, cancellation, recovery and verification.
4. **G26 — Public-user foundation:** authentication, user isolation, durable history and privacy controls, if confirmed missing.
5. **G27 — Release quality:** security, performance, accessibility, mobile UX, deployment/rollback, monitoring and release criteria.

## Guardrails

- No paid provider generation or deployment without explicit authorization.
- No secrets in code, logs, PRs, fixtures or client bundles.
- Label mock/test evidence separately from live provider evidence.
- Report feature status with evidence; do not imply tests equal certification or capability.
- Each milestone should deliver working functionality, executable tests, or a verified defect fix—not documentation alone.
