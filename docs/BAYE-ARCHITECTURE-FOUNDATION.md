# BAYE AI CORE — Architecture foundation

## Mission

Build a reliable, extensible AI system that can understand goals, plan work, coordinate specialist capabilities, use approved tools, verify outcomes, and learn from authorized feedback. This document is an engineering direction, not a claim that every capability is already implemented.

## Non-negotiable design principles

1. **Evidence before claims:** distinguish model-generated content, deterministic checks, external evidence, and confirmed execution.
2. **Policy before action:** every tool call must pass a centralized policy decision before execution.
3. **Least privilege:** agents receive only the tools and data required for their assigned task.
4. **Independent verification:** validate outputs against original inputs or trusted external evidence; never treat a model's confidence as proof.
5. **Bounded autonomy:** enforce budgets, deadlines, step limits, retry limits, and explicit approval gates.
6. **Traceability:** record task, plan, agent role, tool request, policy decision, verification result, and final outcome without logging secrets.
7. **Fail closed:** uncertain authorization, malformed input, verification failure, or exhausted budget stops the operation safely.
8. **Provider neutrality:** model and media providers remain behind adapters so BAYE can evolve without coupling its core to one vendor.

## Target architecture

- **Experience layer:** web/mobile interface, streaming progress, accessible controls, user approvals, and transparent task status.
- **Gateway and identity:** authentication, rate limits, tenant boundaries, request validation, and session context.
- **Cognitive coordinator:** goal decomposition, dependency graph, task routing, scheduling, and final synthesis.
- **Specialist agents:** isolated roles such as research, software engineering, data analysis, creative media, quality assurance, and security review. Each role has a strict input/output contract and scoped capabilities.
- **Tool and execution plane:** typed tool registry, policy enforcement, sandboxed execution, quotas, idempotency, and human approval for consequential actions.
- **Verification plane:** deterministic recomputation where possible, schema/invariant checks, test execution, source/evidence validation, and a separate reviewer path for high-impact work.
- **Memory and knowledge:** short-lived task context, user-approved durable memory, provenance, retention controls, and tenant isolation.
- **Multimodal services:** image, video, audio, and document adapters with content validation, provenance, and provider-cost controls.
- **Observability and governance:** structured traces, metrics, audit events, safety evaluations, incident controls, and versioned policies.

## Agent execution contract

Each agent task should carry:
- task_id, parent_task_id, and a correlation/trace identifier;
- a declared role, objective, input references, and expected output schema;
- an allowlist of tools and data scopes;
- a token/cost budget, deadline, maximum tool calls, and retry budget;
- a policy decision and approval requirement;
- a verification plan and explicit completion criteria.

Agents should return structured results with status, artifacts, evidence, assumptions, risks, and proposed next steps. An agent must not grant itself new permissions or silently expand its scope.

## Execution lifecycle

1. Validate and normalize the user goal.
2. Build a bounded plan with dependencies and completion criteria.
3. Ask the policy engine to authorize each proposed capability.
4. Dispatch eligible subtasks to isolated specialist workers.
5. Validate tool inputs and execute only approved operations.
6. Verify each artifact independently; retry only within configured limits.
7. Synthesize results and disclose unresolved uncertainty.
8. Persist only permitted memory and emit a sanitized audit trace.

## Current implementation boundary

The current repository includes bounded local tools (calculator, text_stats), a sequential workflow limited to five steps, deterministic recomputation for those tools, and SHA-256 output receipts. These checks do not prove truth, validate external facts, or constitute a genuine multi-agent system. The current /api/agent path remains a two-call model workflow, not parallel specialist agents.

## Delivery sequence

- **Foundation hardening:** apply independent verification consistently, add adversarial tests, validate API contracts, and keep failure behavior explicit.
- **Orchestration kernel:** typed task graph, coordinator state machine, specialist interfaces, cancellation, budgets, and trace IDs. Start with simulated/deterministic workers before adding multiple model calls.
- **Policy and sandbox:** centralized permissions, approval gates, isolated execution, secrets hygiene, and replay/idempotency protections.
- **Memory and retrieval:** provenance-aware records, retention, tenant separation, and explicit user controls.
- **Multimodal pipeline:** provider adapters, asynchronous jobs, artifact validation, and cost/usage accounting.
- **Evaluation and scale:** regression suites, red-team cases, latency/cost budgets, load tests, and production observability.

## Release discipline

Every milestone must have tests and a clear statement of what is implemented versus planned. Changes land through reviewable pull requests. No production deployment, secret change, paid provider activation, or consequential external action is implied by this roadmap.
