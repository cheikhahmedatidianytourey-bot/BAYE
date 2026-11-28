import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { verifyDurableEvidenceStore } from './snapshot-integrity-evidence-recovery.mjs';

const ZERO_HASH = '0'.repeat(64);
const sha256 = value => createHash('sha256').update(value).digest('hex');
const canonical = value => JSON.stringify({
  schemaVersion: value.schemaVersion,
  sequence: value.sequence,
  timestamp: value.timestamp,
  status: value.status,
  primary: value.primary,
  replica: value.replica,
  findings: value.findings,
  previousHash: value.previousHash
});

function safeDirectory(directory) {
  const resolved = path.resolve(directory);
  const stat = fs.lstatSync(resolved);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('monitor journal directory must be a real directory, not a symlink');
  return resolved;
}

function inspectStore(directory, ledgerBytes) {
  try {
    const root = safeDirectory(directory);
    const latestPath = path.join(root, 'latest.json');
    const stat = fs.lstatSync(latestPath);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('latest manifest is not a regular file');
    const manifest = JSON.parse(fs.readFileSync(latestPath, 'utf8'));
    const verified = verifyDurableEvidenceStore(root, ledgerBytes);
    if (!verified.valid) return { available: true, valid: false, error: verified.error };
    if (!Number.isSafeInteger(manifest.sequence) || typeof manifest.manifestHash !== 'string') {
      return { available: true, valid: false, error: 'manifest metadata is malformed' };
    }
    return {
      available: true, valid: true, sequence: verified.checkpointCount,
      recordCount: verified.recordCount, manifestHash: manifest.manifestHash,
      tailHash: verified.tailHash
    };
  } catch (error) {
    return { available: false, valid: false, error: error.message };
  }
}

function readJournal(file) {
  if (!fs.existsSync(file)) return { sequence: 0, previousHash: ZERO_HASH };
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('monitor journal must be a regular file, not a symlink');
  const raw = fs.readFileSync(file, 'utf8');
  if (!raw) return { sequence: 0, previousHash: ZERO_HASH };
  const lines = raw.split('\n');
  if (lines.at(-1) === '') lines.pop();
  let previousHash = ZERO_HASH;
  for (let i = 0; i < lines.length; i += 1) {
    let entry;
    try { entry = JSON.parse(lines[i]); } catch { throw new Error('monitor journal JSON invalid at line ' + (i + 1)); }
    if (!entry || entry.schemaVersion !== 1 || entry.sequence !== i + 1 ||
        entry.previousHash !== previousHash || entry.entryHash !== sha256(canonical(entry))) {
      throw new Error('monitor journal hash chain invalid at line ' + (i + 1));
    }
    previousHash = entry.entryHash;
  }
  return { sequence: lines.length, previousHash };
}

function appendJournal(directory, event) {
  const file = path.join(directory, 'replication-health.jsonl');
  const lock = path.join(directory, '.replication-health.lock');
  let lockFd;
  try {
    lockFd = fs.openSync(lock, 'wx', 0o600);
    const history = readJournal(file);
    const entry = {
      schemaVersion: 1,
      sequence: history.sequence + 1,
      timestamp: event.timestamp,
      status: event.status,
      primary: event.primary,
      replica: event.replica,
      findings: event.findings,
      previousHash: history.previousHash
    };
    entry.entryHash = sha256(canonical(entry));
    let fd;
    try {
      fd = fs.openSync(file, 'a', 0o600);
      fs.writeSync(fd, JSON.stringify(entry) + '\n');
      fs.fsyncSync(fd);
    } finally {
      if (fd !== undefined) fs.closeSync(fd);
    }
    const dirFd = fs.openSync(directory, 'r');
    try { fs.fsyncSync(dirFd); } finally { fs.closeSync(dirFd); }
    return { file, sequence: entry.sequence, entryHash: entry.entryHash };
  } finally {
    if (lockFd !== undefined) fs.closeSync(lockFd);
    try { fs.unlinkSync(lock); } catch {}
  }
}

/**
 * Performs one evidence-store health assessment and records its result in a
 * tamper-evident local journal. The caller supplies ledger bytes from its trusted
 * source; no network or external service is contacted.
 */
export function monitorEvidenceReplication(primaryDirectory, replicaDirectory, ledgerBytes, journalDirectory, options = {}) {
  if (!Buffer.isBuffer(ledgerBytes)) throw new TypeError('ledgerBytes must be a Buffer');
  const journalRoot = path.resolve(journalDirectory);
  fs.mkdirSync(journalRoot, { recursive: true, mode: 0o700 });
  const journal = safeDirectory(journalRoot);
  const primary = inspectStore(primaryDirectory, ledgerBytes);
  const replica = inspectStore(replicaDirectory, ledgerBytes);
  const findings = [];
  let status;

  if (!primary.available && !replica.available) {
    status = 'storage_unavailable';
    findings.push('primary_and_replica_unavailable');
  } else if (!primary.valid || !replica.valid) {
    status = 'integrity_failure';
    if (!primary.valid) findings.push('primary_invalid: ' + primary.error);
    if (!replica.valid) findings.push('replica_invalid: ' + replica.error);
  } else if (replica.sequence < primary.sequence) {
    status = 'replication_lag';
    findings.push('replica_behind_by_' + (primary.sequence - replica.sequence) + '_checkpoint(s)');
  } else if (replica.sequence > primary.sequence) {
    status = 'rollback_suspected';
    findings.push('replica_ahead_of_primary');
  } else if (replica.manifestHash !== primary.manifestHash || replica.tailHash !== primary.tailHash) {
    status = 'divergence';
    findings.push('same_sequence_has_different_integrity_identity');
  } else {
    status = 'healthy';
    findings.push('primary_and_replica_match');
  }

  const timestamp = options.timestamp || new Date().toISOString();
  const persisted = appendJournal(journal, { timestamp, status, primary, replica, findings });
  return { status, healthy: status === 'healthy', primary, replica, findings, journal: persisted };
}

export function verifyReplicationHealthJournal(journalDirectory) {
  const root = safeDirectory(journalDirectory);
  const history = readJournal(path.join(root, 'replication-health.jsonl'));
  return { valid: true, entries: history.sequence, tailHash: history.previousHash };
}
