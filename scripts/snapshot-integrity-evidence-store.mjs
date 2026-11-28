import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { verifyChain, ZERO_HASH } from './snapshot-integrity-evidence-chain.mjs';

const HASH = /^[a-f0-9]{64}$/;
const canonical = value => JSON.stringify({
  schemaVersion: value.schemaVersion,
  algorithm: value.algorithm,
  rootAnchor: value.rootAnchor,
  recordCount: value.recordCount,
  tailHash: value.tailHash,
  ledgerSha256: value.ledgerSha256,
  chainId: value.chainId
});
const sha256 = value => createHash('sha256').update(value).digest('hex');

function parseLedger(bytes) {
  const raw = bytes.toString('utf8');
  if (!raw.trim()) return [];
  return raw.trimEnd().split('\n').map((line, index) => {
    try { return JSON.parse(line); }
    catch { throw new Error('invalid ledger JSON at line ' + (index + 1)); }
  });
}

export function createCheckpoint(ledgerBytes, options = {}) {
  if (!Buffer.isBuffer(ledgerBytes)) throw new TypeError('ledgerBytes must be a Buffer');
  const rootAnchor = options.rootAnchor ?? ZERO_HASH;
  if (!HASH.test(rootAnchor)) throw new Error('rootAnchor must be a lowercase SHA-256 hash');
  const entries = parseLedger(ledgerBytes);
  const verified = verifyChain(entries, { expectedPreviousHash: rootAnchor });
  if (!verified.valid) throw new Error('ledger rejected: ' + verified.error);
  if (entries.length === 0) throw new Error('cannot checkpoint an empty ledger');
  const checkpoint = {
    schemaVersion: 1,
    algorithm: 'sha256',
    rootAnchor,
    recordCount: entries.length,
    tailHash: verified.tailHash,
    ledgerSha256: sha256(ledgerBytes),
    chainId: entries[0].recordHash
  };
  checkpoint.checkpointHash = sha256(canonical(checkpoint));
  return checkpoint;
}

export function verifyCheckpoint(ledgerBytes, checkpoint) {
  if (!Buffer.isBuffer(ledgerBytes) || !checkpoint || typeof checkpoint !== 'object') {
    return { valid: false, error: 'ledger bytes or checkpoint is malformed' };
  }
  if (checkpoint.schemaVersion !== 1 || checkpoint.algorithm !== 'sha256' ||
      !HASH.test(checkpoint.rootAnchor || '') || !HASH.test(checkpoint.tailHash || '') ||
      !HASH.test(checkpoint.ledgerSha256 || '') || !HASH.test(checkpoint.chainId || '') ||
      !HASH.test(checkpoint.checkpointHash || '') ||
      !Number.isSafeInteger(checkpoint.recordCount) || checkpoint.recordCount < 1) {
    return { valid: false, error: 'checkpoint schema or fields are invalid' };
  }
  if (checkpoint.checkpointHash !== sha256(canonical(checkpoint))) {
    return { valid: false, error: 'checkpoint hash mismatch' };
  }
  const entries = parseLedger(ledgerBytes);
  const chain = verifyChain(entries, { expectedPreviousHash: checkpoint.rootAnchor });
  if (!chain.valid) return { valid: false, error: 'ledger chain rejected: ' + chain.error };
  if (entries.length !== checkpoint.recordCount) return { valid: false, error: 'record count differs from checkpoint' };
  if (chain.tailHash !== checkpoint.tailHash) return { valid: false, error: 'tail hash differs from checkpoint' };
  if (entries[0].recordHash !== checkpoint.chainId) return { valid: false, error: 'chain identity differs from checkpoint' };
  if (sha256(ledgerBytes) !== checkpoint.ledgerSha256) return { valid: false, error: 'ledger digest differs from checkpoint' };
  return { valid: true, recordCount: entries.length, tailHash: chain.tailHash, chainId: checkpoint.chainId };
}

export function advanceCheckpoint(ledgerBytes, previousCheckpoint) {
  if (!Buffer.isBuffer(ledgerBytes) || !previousCheckpoint || typeof previousCheckpoint !== 'object') {
    throw new Error('ledger bytes and previous checkpoint are required');
  }
  if (previousCheckpoint.schemaVersion !== 1 ||
      previousCheckpoint.checkpointHash !== sha256(canonical(previousCheckpoint))) {
    throw new Error('previous checkpoint is invalid');
  }
  const entries = parseLedger(ledgerBytes);
  const chain = verifyChain(entries, { expectedPreviousHash: previousCheckpoint.rootAnchor });
  if (!chain.valid) throw new Error('ledger chain rejected: ' + chain.error);
  if (entries.length < previousCheckpoint.recordCount) throw new Error('ledger rollback detected: fewer records than checkpoint');
  if (entries.length === previousCheckpoint.recordCount) {
    const exact = verifyCheckpoint(ledgerBytes, previousCheckpoint);
    if (!exact.valid) throw new Error('checkpoint mismatch: ' + exact.error);
    return previousCheckpoint;
  }
  if (entries[0]?.recordHash !== previousCheckpoint.chainId ||
      entries[previousCheckpoint.recordCount - 1]?.recordHash !== previousCheckpoint.tailHash) {
    throw new Error('continuity break: prior checkpoint prefix does not match ledger');
  }
  return createCheckpoint(ledgerBytes, { rootAnchor: previousCheckpoint.rootAnchor });
}

export function writeCheckpointAtomic(filename, checkpoint) {
  const target = path.resolve(filename);
  const directory = path.dirname(target);
  fs.mkdirSync(directory, { recursive: true });
  const temporary = target + '.tmp-' + process.pid + '-' + Date.now();
  let fd;
  try {
    fd = fs.openSync(temporary, 'wx', 0o600);
    fs.writeFileSync(fd, JSON.stringify(checkpoint, null, 2) + '\n', 'utf8');
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    fs.renameSync(temporary, target);
    const dirFd = fs.openSync(directory, 'r');
    try { fs.fsyncSync(dirFd); } finally { fs.closeSync(dirFd); }
  } catch (error) {
    if (fd !== undefined) fs.closeSync(fd);
    try { fs.unlinkSync(temporary); } catch {}
    throw error;
  }
}

function cli() {
  const [ledgerPath, checkpointPath, mode, anchorArg] = process.argv.slice(2);
  if (!ledgerPath || !checkpointPath || !['--initialize', '--advance', '--verify'].includes(mode)) {
    throw new Error('usage: node scripts/snapshot-integrity-evidence-store.mjs <ledger.jsonl> <checkpoint.json> --initialize|--advance|--verify [root-anchor]');
  }
  const bytes = fs.readFileSync(path.resolve(ledgerPath));
  const target = path.resolve(checkpointPath);
  const anchor = anchorArg || ZERO_HASH;
  if (mode === '--initialize') {
    if (fs.existsSync(target)) throw new Error('checkpoint already exists; use --advance or --verify');
    writeCheckpointAtomic(target, createCheckpoint(bytes, { rootAnchor: anchor }));
    process.stdout.write('BAYE continuity checkpoint initialized.\n');
    return;
  }
  if (!fs.existsSync(target)) throw new Error('checkpoint is missing');
  const previous = JSON.parse(fs.readFileSync(target, 'utf8'));
  if (mode === '--verify') {
    const result = verifyCheckpoint(bytes, previous);
    if (!result.valid) throw new Error(result.error);
    process.stdout.write('BAYE continuity checkpoint verified: ' + result.recordCount + ' record(s).\n');
    return;
  }
  const next = advanceCheckpoint(bytes, previous);
  writeCheckpointAtomic(target, next);
  process.stdout.write('BAYE continuity checkpoint advanced: ' + next.recordCount + ' record(s).\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  try { cli(); }
  catch (error) {
    process.stderr.write('BAYE continuity checkpoint failed: ' + (error?.message || error) + '\n');
    process.exitCode = 1;
  }
}
