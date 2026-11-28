import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createChainEntry, ZERO_HASH } from './snapshot-integrity-evidence-chain.mjs';
import {
  createCheckpoint, verifyCheckpoint, advanceCheckpoint, writeCheckpointAtomic
} from './snapshot-integrity-evidence-store.mjs';

const oneBytes = Buffer.from('first evidence payload');
const twoBytes = Buffer.from('second evidence payload');
const threeBytes = Buffer.from('third evidence payload');
const evidence = n => ({ commit: { sha: String(n).repeat(40) } });
function ledgerWithTwo() {
  const first = createChainEntry(oneBytes, evidence(1), ZERO_HASH, 1, 'one.json');
  const second = createChainEntry(twoBytes, evidence(2), first.recordHash, 2, 'two.json');
  return { first, second, bytes: Buffer.from(JSON.stringify(first) + '\n' + JSON.stringify(second) + '\n') };
}
function append(bytes, entry) {
  return Buffer.concat([bytes, Buffer.from(JSON.stringify(entry) + '\n')]);
}

test('creates and verifies a portable checkpoint for a complete ledger', () => {
  const { bytes } = ledgerWithTwo();
  const checkpoint = createCheckpoint(bytes);
  const result = verifyCheckpoint(bytes, checkpoint);
  assert.equal(result.valid, true);
  assert.equal(result.recordCount, 2);
});

test('detects full-ledger truncation, deletion, and byte-level modification', () => {
  const { bytes, first } = ledgerWithTwo();
  const checkpoint = createCheckpoint(bytes);
  assert.equal(verifyCheckpoint(Buffer.from(JSON.stringify(first) + '\n'), checkpoint).valid, false);
  assert.equal(verifyCheckpoint(Buffer.alloc(0), checkpoint).valid, false);
  const altered = Buffer.from(bytes.toString('utf8').replace(first.recordHash, 'f'.repeat(64)));
  assert.equal(verifyCheckpoint(altered, checkpoint).valid, false);
});

test('advances only when the previously checkpointed prefix remains intact', () => {
  const { bytes, first, second } = ledgerWithTwo();
  const checkpoint = createCheckpoint(bytes);
  const third = createChainEntry(threeBytes, evidence(3), second.recordHash, 3, 'three.json');
  const extended = append(bytes, third);
  const advanced = advanceCheckpoint(extended, checkpoint);
  assert.equal(advanced.recordCount, 3);
  assert.equal(verifyCheckpoint(extended, advanced).valid, true);
  const fork = createChainEntry(threeBytes, evidence(3), first.recordHash, 3, 'three.json');
  assert.throws(() => advanceCheckpoint(append(bytes, fork), checkpoint), /rejected|continuity break/);
});

test('rejects rollback and tampered checkpoint metadata', () => {
  const { bytes, first } = ledgerWithTwo();
  const checkpoint = createCheckpoint(bytes);
  assert.throws(() => advanceCheckpoint(Buffer.from(JSON.stringify(first) + '\n'), checkpoint), /rollback detected/);
  const tampered = { ...checkpoint, recordCount: 1 };
  assert.equal(verifyCheckpoint(bytes, tampered).valid, false);
  assert.throws(() => advanceCheckpoint(bytes, tampered), /checkpoint is invalid/);
});

test('writes checkpoint atomically with private file permissions', () => {
  const { bytes } = ledgerWithTwo();
  const checkpoint = createCheckpoint(bytes);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'baye-evidence-checkpoint-'));
  const filename = path.join(directory, 'checkpoint.json');
  try {
    writeCheckpointAtomic(filename, checkpoint);
    const saved = JSON.parse(fs.readFileSync(filename, 'utf8'));
    assert.equal(verifyCheckpoint(bytes, saved).valid, true);
    assert.equal(fs.statSync(filename).mode & 0o777, 0o600);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
