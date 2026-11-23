# BAYE v3.7 — Large-scale validation and stress-test program

Status: test plan only. No tests in this document have been run. All load, chaos, security, and recovery experiments must use isolated staging/test infrastructure and synthetic data. Never target production without a separately approved test window and safeguards.

## Objectives
- Validate API correctness, resilience, safety boundaries, latency, resource use, and recovery.
- Establish repeatable baseline metrics and failure criteria.
- Surface bottlenecks before increasing autonomy, traffic, or deployment scale.

## Test tiers and gates
### T0 — Static and dependency checks
- Lint/type-check where configured; dependency and secret scanning; inspect lockfile and build reproducibility.
- Gate: no unresolved critical/high security findings without documented, approved mitigation.

### T1 — Functional regression and contract tests
- API contracts, schema validation, auth/no-auth behavior, mission ID consistency, memory validation, deterministic calculator edge cases, malformed requests, error mapping.
- Include boundary values, null/undefined, arrays vs objects, oversized fields, invalid Unicode, serialization failures, and unexpected provider responses.
- Gate: all tests reproducible; no unexplained failures.

### T2 — Load and performance (staging only)
- Baseline: 1 concurrent user; ramp 5, 10, 25, 50, 100 virtual users (adapt to instance limits); 5–15 minutes per tier.
- Measure p50/p95/p99 latency, throughput, error rate, CPU, RSS, event-loop delay, provider latency, queue wait, storage I/O and rate-limit behavior.
- Separate tests for health endpoint, ordinary API, orchestration with mocked provider, and controlled provider integration.
- Gate (initial provisional target, tune after baseline): errors below 1% for non-provider tests; no sustained resource growth; p95 API latency below 2s for local/mock non-orchestration routes. These are goals, not current measurements or promises.

### T3 — Stress and saturation
- Ramp beyond expected staging capacity until throttling or saturation, without exceeding explicit resource caps.
- Verify rate limiting, backpressure, bounded concurrency, graceful rejection, and recovery after load stops.
- Gate: no unbounded queues, runaway processes, data corruption, or memory growth that continues after recovery.

### T4 — Fault injection / chaos
- Mock provider timeout, malformed JSON, 429, 5xx, connection reset, slow responses, missing credentials.
- Storage read/write failure, disk-full simulation, corrupt store, interrupted atomic write, permission errors.
- Worker failure at each phase, dependency failure, partial concurrent batch failure, cancellation, retry exhaustion.
- Gate: bounded retries, clear statuses, no false success, no unsafe side effects, no mission memory persisted for failed missions.

### T5 — Security and abuse testing
- Auth token expiry, wrong issuer/audience/signature, malformed bearer header, missing configuration, subject isolation, replay/duplicate mission requests.
- Prompt-injection strings in task/dependency/memory inputs; verify instruction/data separation and prohibited tool claims.
- Request flooding, payload-size boundaries, path and identifier fuzzing, prototype-like keys, serialization edge cases.
- Gate: no cross-owner data access, secrets exposure, unintended external actions, or bypass of authentication policy.

### T6 — Persistence and recovery
- Retention/TTL, future timestamps, bounded record count/file size, concurrent saves, owner and mission isolation, process restart.
- Atomic-write behavior and backup/recovery procedure. Test single-instance assumptions; document that file storage is not multi-instance safe.
- Gate: no silent corruption or cross-tenant leakage; failures explicitly surfaced; recoverable state documented.

### T7 — Frontend and user experience
- Build, smoke test, accessibility basics, API failure states, loading/timeout/error states, mobile viewport, retry behavior.
- Gate: user-facing status accurately distinguishes plan, execution, verification, and persistence.

### T8 — End-to-end mission quality
- Use a fixed, versioned suite of synthetic tasks with known expected outcomes.
- Evaluate plan validity, dependency handling, bounded execution, output schema, review quality, evidence traceability, and memory continuity.
- Blind/independent scoring; separate factual correctness from stylistic quality.
- Gate: report scores and failure taxonomy; never label model-generated output as independently verified unless evidence supports it.

## Experiment safety rules
- Staging and synthetic accounts/data only; no production data.
- Explicit test budget, concurrency cap, duration cap, kill switch, and owner for each run.
- Mock external services by default. Provider integration tests must have a budget and rate cap.
- Do not test destructive actions, uncontrolled network access, or deployment actions.
- Record commit SHA, environment, test configuration, artifacts, timestamps, and result.
- Every failure becomes a reproducible issue or regression test.

## Reporting template
For each run record: experiment ID; code SHA; environment; date; traffic profile; duration; resource ceilings; measurements (p50/p95/p99, throughput, errors, CPU, memory, event loop, storage); incidents; reproducibility; outcome; follow-up owner; status (pass/fail/inconclusive).

## Initial readiness checklist
- [ ] Isolated staging environment and test credentials
- [ ] Mock AI provider and controllable fault responses
- [ ] Metrics and logs with redaction verified
- [ ] Test runner/CI workflow and artifacts retention
- [ ] Resource caps and emergency stop
- [ ] Baseline captured before thresholds are finalized
- [ ] Test suite reviewed; no production load
