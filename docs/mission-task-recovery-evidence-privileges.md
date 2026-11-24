# BAYE v6.1 — Recovery evidence database privilege boundary

## Purpose

The v6.0 writer's authorization callback is an integration seam, not a complete authorization system. This migration adds a database-enforced separation between the recovery worker and the trusted lifecycle writer.

## Required database roles

Provision these roles separately through the organization's database administration process:

- `baye_recovery_worker`: non-owner, non-superuser role used by recovery workers.
- `baye_lifecycle_writer`: non-owner, non-superuser role used only by the authenticated lifecycle service that records observed evidence.

Do not grant either role membership in the table-owner role or in a role that has broader table privileges. Neither role may be a superuser or own the table. Use separate credentials and connection pools; never expose lifecycle credentials to the recovery worker.

## Apply

1. Ensure the v5.9 schema exists, including `public.baye_mission_task_recovery_evidence`.
2. Provision the two roles with secure credentials outside this migration.
3. Apply `migrations/0061_recovery_evidence_role_privileges.sql` as the table owner or database administrator.
4. Configure the recovery service to use only `baye_recovery_worker`.
5. Configure the trusted lifecycle service to use only `baye_lifecycle_writer`.

The migration fails closed if either role is missing. It revokes table privileges from PUBLIC and both named roles before granting SELECT only to the recovery worker and INSERT/UPDATE only to the lifecycle writer. It does not create login roles, set passwords, grant role membership, or change ownership.

## Important limitations

PostgreSQL privileges do not authenticate the real-world origin or truth of evidence. The lifecycle service must authenticate its caller, authorize the mission/task scope, derive evidence from trusted lifecycle observations, and keep its credentials private. Audit role memberships, inherited privileges, table ownership, schema privileges, and any alternate database paths.

The lifecycle writer currently performs an upsert. Its database role therefore needs INSERT and UPDATE. It does not need DELETE or TRUNCATE. The recovery worker needs SELECT only.

## Validation status

This change supplies a privilege migration and documentation. It does not claim that the migration has been applied to a live database or that the production roles/credentials are configured. Validate grants and denied writes against a disposable PostgreSQL instance before production use.
