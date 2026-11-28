// G72: bounded PostgreSQL incident store.
import pg from 'pg';

const pool = process.env.DATABASE_URL
  ? new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_SSL === 'disable' ? false : { rejectUnauthorized: false },
      max: 3,
    })
  : null;
const MAX = 10000;

export function persistentIncidentStorageReady() {
  return Boolean(pool);
}

export async function initializeIncidentStorage() {
  if (!pool) throw new Error('DATABASE_URL required');
  await pool.query('CREATE TABLE IF NOT EXISTS baye_diagnostic_incidents (id TEXT PRIMARY KEY, incident JSONB NOT NULL, status TEXT NOT NULL, severity TEXT NOT NULL, updated_at TIMESTAMPTZ NOT NULL)');
  await pool.query('CREATE INDEX IF NOT EXISTS baye_incidents_status_idx ON baye_diagnostic_incidents(status,updated_at DESC)');
  await pool.query('CREATE INDEX IF NOT EXISTS baye_incidents_severity_idx ON baye_diagnostic_incidents(severity,updated_at DESC)');
}

export async function saveIncidentRecord(input) {
  if (!pool) throw new Error('DATABASE_URL required');
  if (!input || typeof input.id !== 'string' || input.id.length > 500 ||
      typeof input.path !== 'string' || typeof input.category !== 'string' ||
      typeof input.status !== 'string' || typeof input.severity !== 'string') {
    return { status: 'rejected', errors: ['invalid incident record'] };
  }
  const incident = { ...input };
  if (Buffer.byteLength(JSON.stringify(incident), 'utf8') > 16000) {
    return { status: 'rejected', errors: ['incident exceeds 16KB'] };
  }
  const result = await pool.query(
    'INSERT INTO baye_diagnostic_incidents(id,incident,status,severity,updated_at) SELECT $1,$2::jsonb,$3,$4,$5 WHERE (SELECT count(*) FROM baye_diagnostic_incidents)<$6 ON CONFLICT(id) DO UPDATE SET incident=EXCLUDED.incident,status=EXCLUDED.status,severity=EXCLUDED.severity,updated_at=EXCLUDED.updated_at RETURNING id',
    [incident.id, JSON.stringify(incident), incident.status, incident.severity, incident.lastSeen || new Date().toISOString(), MAX],
  );
  if (!result.rowCount) return { status: 'capacity', limit: MAX };
  return { status: 'stored', incident };
}

export async function listStoredIncidents({ status = '', severity = '', limit = 100 } = {}) {
  if (!pool) throw new Error('DATABASE_URL required');
  const n = Math.min(200, Math.max(1, Number.isInteger(limit) ? limit : 100));
  const result = await pool.query(
    'SELECT incident FROM baye_diagnostic_incidents WHERE ($1::text IS NULL OR status=$1) AND ($2::text IS NULL OR severity=$2) ORDER BY updated_at DESC LIMIT $3',
    [status || null, severity || null, n],
  );
  return { items: result.rows.map(row => row.incident), limit: n, storage: 'postgresql', persistent: true };
}

export async function getStoredIncident(id) {
  if (!pool) throw new Error('DATABASE_URL required');
  const result = await pool.query('SELECT incident FROM baye_diagnostic_incidents WHERE id=$1', [id]);
  return result.rows[0]?.incident || null;
}

export async function getIncidentStorageStatus() {
  if (!pool) return { configured: false, initialized: false, persistent: false, storage: 'postgresql', capacity: MAX };
  try {
    const result = await pool.query('SELECT count(*)::int AS count FROM baye_diagnostic_incidents');
    return { configured: true, initialized: true, persistent: true, storage: 'postgresql', count: result.rows[0].count, capacity: MAX };
  } catch {
    return { configured: true, initialized: false, persistent: true, storage: 'postgresql', capacity: MAX };
  }
}
