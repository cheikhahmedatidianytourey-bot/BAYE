-- BAYE G1 schema foundation. Apply only through an explicit migration workflow.
BEGIN;
CREATE TABLE IF NOT EXISTS baye_schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS baye_missions (
  mission_id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued','running','waiting','paused','completed','failed','cancelled')),
  goal TEXT NOT NULL,
  constraints_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  checkpoint_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  retry_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  approvals_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  audit_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  heartbeat_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  record_json JSONB NOT NULL,
  version BIGINT NOT NULL DEFAULT 1,
  UNIQUE(owner_id, mission_id)
);
CREATE INDEX IF NOT EXISTS baye_missions_owner_created_idx ON baye_missions(owner_id, created_at, mission_id);
CREATE INDEX IF NOT EXISTS baye_missions_status_updated_idx ON baye_missions(status, updated_at);
CREATE TABLE IF NOT EXISTS baye_mission_tasks (
  mission_id TEXT NOT NULL REFERENCES baye_missions(mission_id) ON DELETE CASCADE,
  owner_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  task_order INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','running','waiting','completed','failed','cancelled')),
  dependencies JSONB NOT NULL DEFAULT '[]'::jsonb,
  attempt INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL,
  record_json JSONB NOT NULL,
  PRIMARY KEY(mission_id, task_id),
  FOREIGN KEY(owner_id, mission_id) REFERENCES baye_missions(owner_id, mission_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS baye_mission_tasks_owner_status_idx ON baye_mission_tasks(owner_id, status);
INSERT INTO baye_schema_migrations(version) VALUES (1) ON CONFLICT (version) DO NOTHING;
COMMIT;
