-- BAYE G27: durable account identity and monthly usage ledger.
-- Apply through a reviewed migration process; do not run automatically at startup.
CREATE TABLE IF NOT EXISTS baye_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash TEXT UNIQUE NOT NULL,
  plan_id TEXT NOT NULL DEFAULT 'free' CHECK (plan_id IN ('free','pro','ultra')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  disabled_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS baye_usage_ledger (
  account_id UUID NOT NULL REFERENCES baye_accounts(id) ON DELETE CASCADE,
  period_month DATE NOT NULL,
  usage_type TEXT NOT NULL CHECK (usage_type IN ('text','image','video','agent')),
  used INTEGER NOT NULL DEFAULT 0 CHECK (used >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (account_id, period_month, usage_type)
);
CREATE INDEX IF NOT EXISTS baye_usage_period_idx ON baye_usage_ledger(period_month);
