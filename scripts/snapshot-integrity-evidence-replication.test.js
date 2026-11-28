import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createChainEntry, ZERO_HASH } from './snapshot-integrity-evidence-chain.mjs';
import { persistDurableCheckpoint } from './snapshot-integrity-evidence-recovery.mjs';
import { replicateDurableEvidenceStore, recoverFromDurableEvidenceReplica } from './snapshot-integrity-evidence-replication.mjs';

const payload = n => Buffer.from('replicated evidence ' + n);
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
function directory() { return fs.mkdtempSync(path.join(os.tmpdir(), 'baye-evidence-replica-')); }

test('replicates checkpoint history and ledger prefixes; recovers after primary storage and ledger loss', () => {
  const parent = directory();
  const primary = path.join(parent, 'primary');
  const replica = path.join(parent, 'independent-copy');
  try {
    const firstLedger = ledger(2);
    persistDurableCheckpoint(primary, firstLedger);
    const secondLedger = ledger(3);
    persistDurableCheckpoint(primary, secondLedger);
    const copied = replicateDurableEvidenceStore(primary, replica, secondLedger);
    assert.equal(copied.replicated, true);
    assert.equal(copied.checkpointCount, 2);
    assert.equal(fs.existsSync(path.join(replica, 'checkpoint-00000001.json')), true);
    assert.equal(fs.existsSync(path.join(replica, 'ledger-00000001.jsonl')), true);
    assert.equal(fs.existsSync(path.join(replica, 'ledger-00000002.jsonl')), true);

    fs.rmSync(primary, { recursive: true, force: true });
    const recovered = recoverFromDurableEvidenceReplica(replica);
    assert.equal(recovered.recoveredFromReplica, true);
    assert.equal(recovered.checkpointCount, 2);
    assert.equal(recovered.recordCount, 3);
    assert.deepEqual(recovered.ledgerBytes, secondLedger);
  } finally { fs.rmSync(parent, { recursive: true, force: true }); }
});

test('advances an existing replica without overwriting earlier checkpoint generations', () => {
  const parent = directory();
  const primary = path.join(parent, 'primary');
  const replica = path.join(parent, 'replica');
  try {
    const first = ledger(1);
    persistDurableCheckpoint(primary, first);
    replicateDurableEvidenceStore(primary, replica, first);
    const saved = fs.readFileSync(path.join(replica, 'checkpoint-00000001.json'));
    const second = ledger(2);
    persistDurableCheckpoint(primary, second);
    const result = replicateDurableEvidenceStore(primary, replica, second);
    assert.equal(result.checkpointCount, 2);
    assert.deepEqual(fs.readFileSync(path.join(replica, 'checkpoint-00000001.json')), saved);
    assert.equal(recoverFromDurableEvidenceReplica(replica).recordCount, 2);
  } finally { fs.rmSync(parent, { recursive: true, force: true }); }
});

test('rejects divergent, ahead-of-source and symlink replica locations', () => {
  const parent = directory();
  const primary = path.join(parent, 'primary');
  const replica = path.join(parent, 'replica');
  const target = path.join(parent, 'target');
  const link = path.join(parent, 'link');
  try {
    const first = ledger(1);
    persistDurableCheckpoint(primary, first);
    replicateDurableEvidenceStore(primary, replica, first);
    fs.writeFileSync(path.join(replica, 'checkpoint-00000001.json'), '{}');
    assert.throws(() => replicateDurableEvidenceStore(primary, replica, first), /invalid|diverges/i);
    fs.mkdirSync(target);
    fs.symlinkSync(target, link, 'dir');
    assert.throws(() => replicateDurableEvidenceStore(primary, link, first), /symlink/i);
  } finally { fs.rmSync(parent, { recursive: true, force: true }); }
});

test('refuses to replicate a store onto itself', () => {
  const parent = directory();
  try {
    const bytes = ledger(1);
    persistDurableCheckpoint(parent, bytes);
    assert.throws(() => replicateDurableEvidenceStore(parent, parent, bytes), /different/);
  } finally { fs.rmSync(parent, { recursive: true, force: true }); }
});
