# BAYE capability benchmark — protocol

## Purpose
Create a repeatable internal evaluation system to guide rapid development and compare BAYE versions using the same task suite. External competitor scores must only be published when tests are run under disclosed, comparable conditions.

## Benchmark dimensions
1. **Reliability & contracts**: correct schema, safe failure, no fabricated completion.
2. **Reasoning & planning**: constraint satisfaction, plan consistency, dependency correctness.
3. **Execution**: tool/action success only with verifiable evidence; permission boundaries respected.
4. **Continuity & memory**: recall precision, relevance, owner isolation, deletion/retention policy.
5. **Multimodal**: image/video/audio generation and understanding; separately measure latency, quality, and policy compliance.
6. **Security & privacy**: prompt injection resistance, tenant isolation, secret leakage, unsafe actions.
7. **UX & accessibility**: clear status, responsiveness, accessibility, recovery from errors.
8. **Performance & cost**: latency percentiles, throughput, resource consumption, unit cost where measured.
9. **Recovery & resilience**: bounded retries, fault recovery, cancellation, consistency.

## Scoring rules
- Each test case carries a category, a defined expected outcome, and a test method.
- Outcomes: pass, fail, blocked, skipped, or inconclusive. Blocked/skipped/inconclusive are not passes.
- Report category scores as passed / (passed + failed) only. Also report coverage separately (executed / total).
- No aggregate score should hide a failed critical safety test. Critical safety failures are flagged and prevent a release recommendation regardless of score.
- Blind human review for creative or subjective tasks, with rubric and reviewer agreement reported.
- Preserve benchmark version, BAYE commit, model/provider, environment, configuration, date, artifacts, and evaluator identity.
- Avoid comparing model/provider results unless prompt, settings, limits, task set, and scoring are comparable.

## Test suite construction
Start with 25 curated tasks per dimension, then expand to 100+, with duplicate and adversarial variants. Keep a frozen test set and a separate development set. Use synthetic inputs and staging only. Do not run unauthorized external-provider or production tests.

## Release gate
A version may be recommended only if: CI is green; no critical safety regression; no unresolved high-risk findings; test coverage and blocked cases are disclosed; performance and cost are within approved budgets; and evidence is reproducible.

## Report template
- Version/commit:
- Suite version:
- Environment/provider:
- Total / executed / pass / fail / blocked / skipped / inconclusive:
- Dimension score and coverage:
- Critical failures:
- Latency/cost/resource measurements:
- Review agreement:
- Evidence/artifacts:
- Release decision: pass / fail / inconclusive
