-- BAYE persistent account and quota ledger schema (G27)
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS baye_accounts (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 email TEXT UNIQUE NOT NULL,
 password_hash TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS baye_sessions (
 token_hash TEXT PRIMARY KEY,
 account_id UUID NOT NULL REFERENCES baye_accounts(id) ON DELETE CASCADE,
 expires_at TIMESTAMPTZ NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS baye_quota_usage (
 account_id UUID NOT NULL REFERENCES baye_accounts(id) ON DELETE CASCADE,
 period TEXT NOT NULL,
 usage_type TEXT NOT NULL,
 used INTEGER NOT NULL DEFAULT 0 CHECK (used >= 0),
 PRIMARY KEY(account_id,period,usage_type)
);
