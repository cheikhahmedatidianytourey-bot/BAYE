# BAYE V6 Audit hardening candidate

This stacked candidate consolidates audit findings from Phases A and B before further mission-engine development.

## Phase A validation hardening
- Validate constraints and owner reference shape.
- Validate task timestamps, errors, and dependency uniqueness.
- Reject dependency cycles.
- Enforce checkpoint consistency with completed task states and known task IDs.
- Validate retry metadata, audit events, and approval record shape.

## Phase B review
- Filesystem store remains a single-process / single-writer design; the current store does not provide a cross-process lock or distributed coordination.
- Do not deploy this store on multi-instance writers. Production multi-instance scaling requires a transactional datastore or locking solution.
- Atomic rename does not promise fsync-level durability across sudden hardware/power failure.
- Phase B still needs CI validation; this candidate does not claim runtime or deployment verification.

## Validation gate
Run the full repository test suite, build, and audit workflow against this branch and its stacked parents. Keep draft until verified. No merge or production deployment performed.
