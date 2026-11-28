import test from 'node:test';
import assert from 'node:assert/strict';
import { createChainEntry, verifyChain, ZERO_HASH } from './snapshot-integrity-evidence-chain.mjs';

const a = Buffer.from('evidence-one');
const b = Buffer.from('evidence-two');
const evA = { commit: { sha: 'a'.repeat(40) } };
const evB = { commit: { sha: 'b'.repeat(40) } };
function chain() {
  const first = createChainEntry(a, evA, ZERO_HASH, 1, 'one.json');
  const second = createChainEntry(b, evB, first.recordHash, 2, 'two.json');
  return [first, second];
}
test('accepts a correctly linked two-record chain', () => {
  const result = verifyChain(chain());
  assert.equal(result.valid, true);
  assert.equal(result.checked, 2);
});
test('detects modification of a record payload', () => {
  const entries = chain();
  entries[0].commitSha = 'c'.repeat(40);
  assert.match(verifyChain(entries).error, /record hash mismatch/);
});
test('detects a substituted previous link', () => {
  const entries = chain();
  entries[1].previousRecordHash = 'f'.repeat(64);
  assert.match(verifyChain(entries).error, /previous-record link mismatch/);
});
test('detects a missing first or middle entry through sequence validation', () => {
  const entries = chain();
  assert.match(verifyChain([entries[1]]).error, /sequence/);
});
test('rejects a chain whose root does not match a trusted external anchor', () => {
  const entries = chain();
  assert.equal(verifyChain(entries, { expectedPreviousHash: 'f'.repeat(64) }).valid, false);
});
