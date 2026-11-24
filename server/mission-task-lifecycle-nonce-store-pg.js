/**
 * PostgreSQL-backed single-use lifecycle nonce store.
 * Requires the migration in migrations/; relies on a unique constraint for atomic replay prevention.
 */
export function createPostgresLifecycleNonceStore({ pool } = {}) {
  if (!pool || typeof pool.query !== 'function') throw new TypeError('A PostgreSQL query-capable pool is required.');
  return {
    async consume({ keyId, nonce, expiresAt } = {}) {
      if (typeof keyId !== 'string' || !keyId || typeof nonce !== 'string' || !nonce ||
          !Number.isSafeInteger(expiresAt)) return false;
      const result = await pool.query(
        'INSERT INTO baye_lifecycle_nonces (key_id, nonce, expires_at) VALUES ($1, $2, to_timestamp($3 / 1000.0)) ON CONFLICT (key_id, nonce) DO NOTHING RETURNING key_id',
        [keyId, nonce, expiresAt]
      );
      return Array.isArray(result?.rows) && result.rows.length === 1;
    }
  };
}
