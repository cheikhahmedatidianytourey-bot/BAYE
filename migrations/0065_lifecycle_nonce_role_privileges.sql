-- BAYE v6.5 — least-privilege access to durable lifecycle nonces.
-- Run as the table owner / database administrator after migration 0063.
-- Roles must be provisioned separately; this migration does not create credentials.

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

DO $$
DECLARE
  target_schema TEXT := current_schema();
  nonce_table TEXT := format('%I.%I', current_schema(), 'baye_lifecycle_nonces');
BEGIN
  EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %s FROM PUBLIC', nonce_table);
  EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %s FROM baye_recovery_worker', nonce_table);
  EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %s FROM baye_lifecycle_writer', nonce_table);

  EXECUTE format('GRANT USAGE ON SCHEMA %I TO baye_lifecycle_writer', target_schema);
  EXECUTE format('GRANT INSERT ON TABLE %s TO baye_lifecycle_writer', nonce_table);
  -- No SELECT, UPDATE, DELETE, TRUNCATE, ownership, or role membership is granted.
END
$$;
