-- Durable single-use lifecycle nonce storage. Apply with a privileged migration account.
CREATE TABLE IF NOT EXISTS baye_lifecycle_nonces (
  key_id TEXT NOT NULL,
  nonce TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (key_id, nonce)
);

CREATE INDEX IF NOT EXISTS baye_lifecycle_nonces_expiry_idx
  ON baye_lifecycle_nonces (expires_at);
