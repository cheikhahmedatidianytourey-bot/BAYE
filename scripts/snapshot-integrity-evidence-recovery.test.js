import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createChainEntry, ZERO_HASH } from './snapshot-integrity-evidence-chain.mjs';
import { persistDurableCheckpoint, verifyDurableEvidenceStore, recoverDurableEvidenceStore } from './snapshot-integrity-evidence-recovery.mjs';

const payload = n => Buffer.from('evidence payload ' + n);
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
function temporaryStore() { return fs.mkdtempSync(path.join(os.tmpdir(), 'baye-durable-evidence-')); }

test('persists immutable checkpoint history and recovers after reopening the store', () => {
  const directory = temporaryStore();
  try {
    const first = persistDurableCheckpoint(directory, ledger(2));
    assert.equal(first.sequence, 1);
    const restarted = recoverDurableEvidenceStore(directory, ledger(2));
    assert.equal(restarted.checkpointCount, 1);
    const second = persistDurableCheckpoint(directory, ledger(3));
    assert.equal(second.sequence, 2);
    assert.equal(fs.existsSync(path.join(directory, 'checkpoint-00000001.json')), true);
    assert.equal(recoverDurableEvidenceStore(directory, ledger(3)).recordCount, 3);
    assert.equal(fs.statSync(directory).mode & 0o777, 0o700);
    assert.equal(fs.statSync(path.join(directory, 'checkpoint-00000001.json')).mode & 0o777, 0o600);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('detects rollback, missing history, modified checkpoint and tampered latest pointer', () => {
  const directory = temporaryStore();
  try {
    persistDurableCheckpoint(directory, ledger(2));
    persistDurableCheckpoint(directory, ledger(3));
    assert.equal(verifyDurableEvidenceStore(directory, ledger(2)).valid, false);
    fs.unlinkSync(path.join(directory, 'checkpoint-00000001.json'));
    assert.equal(verifyDurableEvidenceStore(directory, ledger(3)).valid, false);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }

  const second = temporaryStore();
  try {
    persistDurableCheckpoint(second, ledger(2));
    const file = path.join(second, 'checkpoint-00000001.json');
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    saved.recordCount = 99;
    fs.writeFileSync(file, JSON.stringify(saved));
    assert.equal(verifyDurableEvidenceStore(second, ledger(2)).valid, false);
  } finally { fs.rmSync(second, { recursive: true, force: true }); }

  const third = temporaryStore();
  try {
    persistDurableCheckpoint(third, ledger(2));
    const manifestPath = path.join(third, 'latest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.sequence = 7;
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    assert.equal(verifyDurableEvidenceStore(third, ledger(2)).valid, false);
  } finally { fs.rmSync(third, { recursive: true, force: true }); }
});

test('refuses orphaned checkpoints and does not overwrite an existing history file', () => {
  const directory = temporaryStore();
  try {
    fs.writeFileSync(path.join(directory, 'checkpoint-00000001.json'), '{}');
    assert.throws(() => persistDurableCheckpoint(directory, ledger(1)), /orphaned/);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('rejects a symlink as the evidence store directory', () => {
  const parent = temporaryStore();
  const target = path.join(parent, 'target');
  const link = path.join(parent, 'link');
  fs.mkdirSync(target);
  try {
    fs.symlinkSync(target, link, 'dir');
    assert.equal(verifyDurableEvidenceStore(link, ledger(1)).valid, false);
  } finally { fs.rmSync(parent, { recursive: true, force: true }); }
});
