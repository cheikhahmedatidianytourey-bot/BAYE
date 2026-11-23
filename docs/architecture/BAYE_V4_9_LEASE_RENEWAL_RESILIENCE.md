# BAYE v4.9 — Lease renewal and execution resilience

This stacked change extends the v4.8 opt-in adapter with periodic lease renewal while a task is executing.

- Requires a coordination store exposing `claim`, `renew`, and `settle`.
- A renewal is scheduled at a configurable interval shorter than the lease.
- A refused or failed renewal races the task result and fails the adapter closed; it attempts to settle the claim as `needs_review`.
- A successful worker result still requires accepted `completed` settlement.
- Renewal timers are cleared on all terminal paths; the timer is unref'd when supported.
- No automatic retry, replay, crash recovery, public endpoint activation, production pool, secret, Render change or deployment is included.

Limitations: racing a lease-loss signal does not physically cancel a worker or any external side effects already in progress. The executor passed to this adapter must support safe/cooperative cancellation if needed. This adapter does not provide exactly-once external effects. Tests use a controlled store double; they are not production PostgreSQL runtime tests.
