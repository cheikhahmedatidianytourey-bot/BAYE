import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createChainEntry, ZERO_HASH } from './snapshot-integrity-evidence-chain.mjs';
import { persistDurableCheckpoint } from './snapshot-integrity-evidence-recovery.mjs';
import { replicateDurableEvidenceStore } from './snapshot-integrity-evidence-replication.mjs';
import { monitorEvidenceReplication, verifyReplicationHealthJournal } from './snapshot-integrity-evidence-health.mjs';

const payload = n => Buffer.from('health evidence ' + n);
const evidence = n => ({ commit: { sha: String(n).repeat(40) } });
function ledger(count) {
  let previous = ZERO_HASH;
  const entries = [];
  for (let i = 1; i <= count; i += 1) {
    const entry = createChainEntry(payload(i), evidence(i), previous, i, 'evidence-' + i + '.json');
    entries.push(entry);
    previous = entry.recordHash;
  }
  return Buffer.from(entries.map(entry => JSON.stringify(entry)).join('\n') + '\n');
}
function directory() { return fs.mkdtempSync(path.join(os.tmpdir(), 'baye-health-monitor-')); }

test('reports healthy when primary and replica have identical verified histories', () => {
  const root = directory();
  try {
    const bytes = ledger(2);
    const primary = path.join(root, 'primary');
    const replica = path.join(root, 'replica');
    const journal = path.join(root, 'journal');
    persistDurableCheckpoint(primary, bytes);
    replicateDurableEvidenceStore(primary, replica, bytes);
    const result = monitorEvidenceReplication(primary, replica, bytes, journal, { timestamp: '2026-11-28T12:00:00.000Z' });
    assert.equal(result.status, 'healthy');
    assert.equal(result.journal.sequence, 1);
    assert.equal(verifyReplicationHealthJournal(journal).entries, 1);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('detects replication lag and persists subsequent recovery to healthy', () => {
  const root = directory();
  try {
    const first = ledger(1);
    const second = ledger(2);
    const primary = path.join(root, 'primary');
    const replica = path.join(root, 'replica');
    const journal = path.join(root, 'journal');
    persistDurableCheckpoint(primary, first);
    persistDurableCheckpoint(replica, first);
    persistDurableCheckpoint(primary, second);
    assert.equal(monitorEvidenceReplication(primary, replica, second, journal).status, 'replication_lag');
    replicateDurableEvidenceStore(primary, replica, second);
    assert.equal(monitorEvidenceReplication(primary, replica, second, journal).status, 'healthy');
    const verified = verifyReplicationHealthJournal(journal);
    assert.equal(verified.entries, 2);
    assert.equal(verified.valid, true);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('distinguishes same-sequence divergent histories', () => {
  const root = directory();
  try {
    const bytes = ledger(1);
    const primary = path.join(root, 'primary');
    const replica = path.join(root, 'replica');
    persistDurableCheckpoint(primary, bytes, { rootAnchor: 'a'.repeat(64) });
    persistDurableCheckpoint(replica, bytes, { rootAnchor: 'b'.repeat(64) });
    const result = monitorEvidenceReplication(primary, replica, bytes, path.join(root, 'journal'));
    assert.equal(result.status, 'divergence');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('detects missing stores and corrupted evidence as incidents', () => {
  const root = directory();
  try {
    const bytes = ledger(1);
    const missing = monitorEvidenceReplication(path.join(root, 'missing-a'), path.join(root, 'missing-b'), bytes, path.join(root, 'journal'));
    assert.equal(missing.status, 'storage_unavailable');
    const primary = path.join(root, 'primary');
    const replica = path.join(root, 'replica');
    persistDurableCheckpoint(primary, bytes);
    replicateDurableEvidenceStore(primary, replica, bytes);
    fs.writeFileSync(path.join(replica, 'checkpoint-00000001.json'), '{}');
    const corrupted = monitorEvidenceReplication(primary, replica, bytes, path.join(root, 'journal'));
    assert.equal(corrupted.status, 'integrity_failure');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('rejects tampered health journal and symlink journal file', () => {
  const root = directory();
  try {
    const bytes = ledger(1);
    const primary = path.join(root, 'primary');
    const replica = path.join(root, 'replica');
    const journal = path.join(root, 'journal');
    persistDurableCheckpoint(primary, bytes);
    replicateDurableEvidenceStore(primary, replica, bytes);
    monitorEvidenceReplication(primary, replica, bytes, journal);
    const file = path.join(journal, 'replication-health.jsonl');
    fs.appendFileSync(file, '{"tampered":true}\n');
    assert.throws(() => verifyReplicationHealthJournal(journal), /invalid/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
