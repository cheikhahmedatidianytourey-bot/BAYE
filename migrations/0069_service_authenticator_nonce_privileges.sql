-- BAYE v6.9 — least-privilege access for Gateway service-auth nonce consumption.
-- Apply as the nonce table owner / database administrator after migration 0063.
-- Provision the login role and credentials separately; this migration creates neither.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'baye_service_authenticator') THEN
    RAISE EXCEPTION 'Required role baye_service_authenticator does not exist';
  END IF;
END
$$;

DO $$
DECLARE
  target_schema TEXT := current_schema();
  nonce_table TEXT := format('%I.%I', current_schema(), 'baye_lifecycle_nonces');
BEGIN
  EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %s FROM PUBLIC', nonce_table);
  EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %s FROM baye_service_authenticator', nonce_table);
  EXECUTE format('GRANT USAGE ON SCHEMA %I TO baye_service_authenticator', target_schema);
  EXECUTE format('GRANT INSERT ON TABLE %s TO baye_service_authenticator', nonce_table);
  -- INSERT is sufficient for INSERT ... ON CONFLICT DO NOTHING RETURNING.
  -- No SELECT, UPDATE, DELETE, TRUNCATE, ownership, or role membership is granted.
END
$$;
