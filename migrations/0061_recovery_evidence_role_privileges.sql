-- BAYE v6.1 — isolate recovery evidence writes to the trusted lifecycle DB role.
-- Apply as the table owner / database administrator after v5.9 schema creation.
-- Required roles must be provisioned separately; this migration never creates login roles.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'baye_recovery_worker') THEN
    RAISE EXCEPTION 'Required role baye_recovery_worker does not exist';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'baye_lifecycle_writer') THEN
    RAISE EXCEPTION 'Required role baye_lifecycle_writer does not exist';
  END IF;
END
$$;

REVOKE ALL PRIVILEGES ON TABLE public.baye_mission_task_recovery_evidence FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public.baye_mission_task_recovery_evidence FROM baye_recovery_worker;
REVOKE ALL PRIVILEGES ON TABLE public.baye_mission_task_recovery_evidence FROM baye_lifecycle_writer;

GRANT USAGE ON SCHEMA public TO baye_recovery_worker;
GRANT USAGE ON SCHEMA public TO baye_lifecycle_writer;

GRANT SELECT ON TABLE public.baye_mission_task_recovery_evidence TO baye_recovery_worker;
GRANT INSERT, UPDATE ON TABLE public.baye_mission_task_recovery_evidence TO baye_lifecycle_writer;

-- Intentionally no DELETE, TRUNCATE, ownership, role membership, or execution grants.
