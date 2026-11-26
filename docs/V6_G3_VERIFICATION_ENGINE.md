# BAYE G3 — Verification Engine (initial harness)

## Scope
A bounded, deterministic scenario runner for the Node test suite. It captures pass/fail outcomes and bounded error text, and continues through scenario failures so reports can reveal more than one failure.

## Initial corpus
- Scenario runner reporting and continuation after failure.
- Configuration and scenario-count bounds.
- Deterministic generated acyclic chains.
- Deterministic cycle and unknown-dependency mutation cases.
- Bounded error reporting.

## Limitations
This is an initial test harness, not a security scanner, autonomous repair system, distributed chaos platform, or production monitor. The timeout bounds reporting, but JavaScript promises cannot forcibly stop scenario work after timeout; scenarios must avoid unmanaged side effects. Production chaos testing, worker concurrency, crash recovery, adapter conformance, and isolation testing remain future gates.

## Gate
Run `npm test` and `npm run build` through the repository validation workflow. Inspect the results and failures before considering merge. No merge, deployment, or production operations are performed by this change.