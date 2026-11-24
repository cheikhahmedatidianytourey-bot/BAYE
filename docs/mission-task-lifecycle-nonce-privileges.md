# BAYE v6.5 — PostgreSQL nonce-store role isolation

## Required roles

Provision these roles through the database administration process, with separate credentials managed outside the repository:

- `baye_recovery_worker`: non-login capability role for the recovery worker; no access to the nonce table.
- `baye_lifecycle_writer`: non-login capability role to which the trusted lifecycle service may be granted membership by an administrator; INSERT only on the nonce table.

Both roles must be non-superuser, non-owner, non-CREATEROLE, non-CREATEDB, and must not inherit memberships that provide broader privileges. Do not give the recovery worker membership in the lifecycle writer role. Keep credentials and role membership outside this migration.

## Apply

1. Apply migration `0063_lifecycle_nonce_store.sql` as a privileged migration account.
2. Provision the two roles separately.
3. Apply `0065_lifecycle_nonce_role_privileges.sql` as the table owner or database administrator in the schema containing `baye_lifecycle_nonces`.
4. Give the nonce-consuming lifecycle component only the lifecycle-writer capability; do not expose its credential to the recovery worker.

The migration revokes all table privileges from PUBLIC and both named roles, then grants INSERT only to `baye_lifecycle_writer`. The adapter returns a constant from its INSERT statement so it does not need SELECT privilege on nonce rows. The recovery worker receives no nonce-table privileges.

## Integration proof

The v6.5 integration suite runs against the disposable local PostgreSQL service in CI. It creates isolated temporary schema and roles, applies migrations 0063 and 0065, inspects effective table grants and role attributes, checks there are no role memberships, verifies the table is not owned by either service role, and attempts permitted and forbidden SQL under SET ROLE. It also exercises the real nonce adapter as the lifecycle writer.

The test refuses non-local database hosts, databases not clearly named as test databases, and pre-existing roles. It does not alter a production database.

## Boundaries

This proves the migration and role boundary in the disposable CI database. It does not provision production roles or passwords, audit an external identity provider, verify production role memberships outside this test cluster, or wire credentials into application routes. Production deployment remains a separate controlled operation.
