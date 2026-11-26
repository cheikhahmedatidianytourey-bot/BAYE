# BAYE AI CORE — Test Campaign Blueprint

## Purpose
Establish repeatable evidence for reliability, correctness, security, performance, and user-facing quality. This blueprint is a plan, not a claim that all tests exist or pass.

## Test layers and acceptance gates
1. **Unit and contract tests**: mission/task validation, storage contracts, orchestration transitions, owner boundaries, deterministic behavior. Gate: stable, repeatable suite; no unexplained failures.
2. **Integration tests**: filesystem and PostgreSQL stores, transaction rollback, schema preflight, pool lifecycle, server startup/shutdown. Gate: real PostgreSQL 16 integration in CI; tests isolate databases and clean up.
3. **Fault and recovery tests**: simulated database outage, slow queries, rejected writes, interrupted requests, storage cleanup, retry bounds. Gate: documented recovery behavior, bounded retries/timeouts, no silent data loss or fallback.
4. **Security tests**: authorization/owner isolation, input validation, injection vectors, secret leakage, dependency and configuration checks. Gate: no cross-owner access, no sensitive data in logs, findings triaged before public release.
5. **Agent execution tests**: task decomposition, execution limits, tool authorization, cancellation, checkpoints, recovery, auditability, refusal of unsafe or out-of-scope actions. Gate: explicit permissions and deterministic test fixtures; no unrestricted real-world actions.
6. **Image/video evaluation**: separate automated and human evaluation sets for prompt adherence, visual fidelity, temporal consistency, anatomy, lighting/materials, artifacts, safety, and reproducibility. Gate: baseline metrics and reviewed sample set before public claims.
7. **Load and endurance tests**: staged concurrent requests, mission volume, latency percentiles, memory/CPU, error rate, connection limits, long-run stability. Gate: isolated environment, defined target capacity, no production traffic or resource exhaustion.
8. **UX and accessibility**: user flows, mobile layouts, keyboard navigation, error recovery, onboarding, and accessibility checks. Gate: critical flows usable and critical defects resolved.
9. **Release-readiness checks**: deployment configuration, health/readiness, backups and restore drills, rollback procedure, monitoring, abuse limits, incident runbook. Gate: checklist signed off; never use production for destructive testing.

## Execution discipline
- Every test must state setup, action, expected result, cleanup, and whether it is destructive.
- Keep secrets out of fixtures, test reports, and logs.
- Use synthetic data; do not use personal data.
- Run tests in local/CI or isolated staging only. Load, fuzz, fault injection, and destructive tests require a scoped environment and explicit safeguards.
- Record failures as reproducible issues; avoid treating a test plan as evidence of capability.
- CI acceptance: tests and build both pass; inspect failed job logs before attributing success.

## Initial baseline
- Existing scripts in package.json: `npm test` and `npm run build`.
- CI workflow currently runs tests and frontend build.
- BAYE validation workflow uses a PostgreSQL 16 service for integration tests.
- This document does not add test cases or certify current coverage; follow-on PRs will implement prioritized gates.
