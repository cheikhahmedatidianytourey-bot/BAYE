import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createCheckpoint, advanceCheckpoint, verifyCheckpoint } from './snapshot-integrity-evidence-store.mjs';

const STORE_SCHEMA = 1;
const sha256 = value => createHash('sha256').update(value).digest('hex');
const canonicalManifest = value => JSON.stringify({
  schemaVersion: value.schemaVersion, sequence: value.sequence,
  checkpointFile: value.checkpointFile, checkpointHash: value.checkpointHash,
  previousManifestHash: value.previousManifestHash
});
const fileName = sequence => 'checkpoint-' + String(sequence).padStart(8, '0') + '.json';

function ensureStore(directory) {
  const target = path.resolve(directory);
  fs.mkdirSync(target, { recursive: true, mode: 0o700 });
  const stat = fs.lstatSync(target);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('evidence store must be a real directory, not a symlink');
  fs.chmodSync(target, 0o700);
  return target;
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { throw new Error('cannot read evidence store file ' + path.basename(file) + ': ' + error.message); }
}

function writeExclusive(file, value) {
  let fd;
  try {
    fd = fs.openSync(file, 'wx', 0o600);
    fs.writeFileSync(fd, JSON.stringify(value, null, 2) + '\n', 'utf8');
    fs.fsyncSync(fd);
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

function writeManifestAtomic(directory, manifest) {
  const target = path.join(directory, 'latest.json');
  const temporary = path.join(directory, '.latest-' + process.pid + '-' + Date.now() + '.tmp');
  let fd;
  try {
    fd = fs.openSync(temporary, 'wx', 0o600);
    fs.writeFileSync(fd, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
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

function makeManifest(sequence, checkpoint, previousManifestHash) {
  const manifest = {
    schemaVersion: STORE_SCHEMA, sequence, checkpointFile: fileName(sequence),
    checkpointHash: checkpoint.checkpointHash,
    previousManifestHash: previousManifestHash || null
  };
  manifest.manifestHash = sha256(canonicalManifest(manifest));
  return manifest;
}

function validateManifest(manifest) {
  return !!manifest && manifest.schemaVersion === STORE_SCHEMA &&
    Number.isSafeInteger(manifest.sequence) && manifest.sequence >= 1 &&
    manifest.checkpointFile === fileName(manifest.sequence) &&
    /^[a-f0-9]{64}$/.test(manifest.checkpointHash || '') &&
    (manifest.previousManifestHash === null || /^[a-f0-9]{64}$/.test(manifest.previousManifestHash || '')) &&
    manifest.manifestHash === sha256(canonicalManifest(manifest));
}

function readHistory(directory, ledgerBytes) {
  const manifestPath = path.join(directory, 'latest.json');
  if (!fs.existsSync(manifestPath)) {
    const snapshots = fs.readdirSync(directory).filter(name => /^checkpoint-\d{8}\.json$/.test(name));
    if (snapshots.length) throw new Error('orphaned checkpoint files found without latest manifest; manual recovery required');
    return { sequence: 0, previousManifestHash: null, latest: null };
  }
  const latest = readJson(manifestPath);
  if (!validateManifest(latest)) throw new Error('latest evidence manifest is invalid or tampered');
  let previousManifestHash = null;
  let priorCheckpoint = null;
  const entries = ledgerBytes.toString('utf8').trim() ? ledgerBytes.toString('utf8').trimEnd().split('\n').map((line, i) => {
    try { return JSON.parse(line); } catch { throw new Error('invalid ledger JSON at line ' + (i + 1)); }
  }) : [];
  for (let sequence = 1; sequence <= latest.sequence; sequence += 1) {
    const name = fileName(sequence);
    const checkpointPath = path.join(directory, name);
    if (!fs.existsSync(checkpointPath)) throw new Error('missing historical checkpoint: ' + name);
    const checkpoint = readJson(checkpointPath);
    if (priorCheckpoint && checkpoint.rootAnchor !== priorCheckpoint.rootAnchor) throw new Error('checkpoint history root anchor changed');
    const prefix = Buffer.from(entries.slice(0, checkpoint.recordCount).map(entry => JSON.stringify(entry)).join('\n') + '\n');
    const checked = verifyCheckpoint(prefix, checkpoint);
    if (!checked.valid) throw new Error('historical checkpoint ' + sequence + ' rejected: ' + checked.error);
    if (sequence > 1 && checkpoint.recordCount <= priorCheckpoint.recordCount) throw new Error('checkpoint history does not advance monotonically');
    if (sequence === 1 && checkpoint.recordCount < 1) throw new Error('first checkpoint is empty');
    const expectedPrevious = priorCheckpoint ? priorCheckpoint.checkpointHash : null;
    const expectedManifest = makeManifest(sequence, checkpoint, expectedPrevious);
    if (sequence === latest.sequence) {
      if (latest.checkpointFile !== name || latest.checkpointHash !== checkpoint.checkpointHash ||
          latest.previousManifestHash !== expectedPrevious || latest.manifestHash !== expectedManifest.manifestHash) {
        throw new Error('latest manifest does not match checkpoint history');
      }
    }
    priorCheckpoint = checkpoint;
    previousManifestHash = expectedManifest.manifestHash;
  }
  const known = new Set(Array.from({ length: latest.sequence }, (_, i) => fileName(i + 1)));
  const actual = fs.readdirSync(directory).filter(name => /^checkpoint-\d{8}\.json$/.test(name));
  if (actual.some(name => !known.has(name))) throw new Error('unexpected or orphaned checkpoint file detected');
  return { sequence: latest.sequence, previousManifestHash, latest: priorCheckpoint };
}

export function verifyDurableEvidenceStore(directory, ledgerBytes) {
  if (!Buffer.isBuffer(ledgerBytes)) return { valid: false, error: 'ledgerBytes must be a Buffer' };
  try {
    const target = path.resolve(directory);
    const stat = fs.lstatSync(target);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('evidence store must be a real directory');
    const history = readHistory(target, ledgerBytes);
    if (!history.latest) return { valid: false, error: 'evidence store is not initialized' };
    return { valid: true, checkpointCount: history.sequence, recordCount: history.latest.recordCount, tailHash: history.latest.tailHash };
  } catch (error) { return { valid: false, error: error.message }; }
}

export function persistDurableCheckpoint(directory, ledgerBytes, options = {}) {
  if (!Buffer.isBuffer(ledgerBytes)) throw new TypeError('ledgerBytes must be a Buffer');
  const target = ensureStore(directory);
  const history = readHistory(target, ledgerBytes);
  const checkpoint = history.latest
    ? advanceCheckpoint(ledgerBytes, history.latest)
    : createCheckpoint(ledgerBytes, options);
  if (history.latest && checkpoint.checkpointHash === history.latest.checkpointHash) {
    return { sequence: history.sequence, checkpoint, unchanged: true };
  }
  const sequence = history.sequence + 1;
  const name = fileName(sequence);
  writeExclusive(path.join(target, name), checkpoint);
  const manifest = makeManifest(sequence, checkpoint, history.previousManifestHash);
  writeManifestAtomic(target, manifest);
  return { sequence, checkpoint, unchanged: false };
}

export function recoverDurableEvidenceStore(directory, ledgerBytes) {
  const result = verifyDurableEvidenceStore(directory, ledgerBytes);
  if (!result.valid) throw new Error('evidence recovery failed: ' + result.error);
  return result;
}
