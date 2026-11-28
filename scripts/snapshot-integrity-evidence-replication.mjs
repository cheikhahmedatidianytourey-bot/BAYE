import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { verifyDurableEvidenceStore, recoverDurableEvidenceStore } from './snapshot-integrity-evidence-recovery.mjs';

const sha256 = value => createHash('sha256').update(value).digest('hex');
const checkpointName = sequence => 'checkpoint-' + String(sequence).padStart(8, '0') + '.json';
const ledgerName = sequence => 'ledger-' + String(sequence).padStart(8, '0') + '.jsonl';

function ledgerPrefix(ledgerBytes, recordCount) {
  const lines = ledgerBytes.toString('utf8').split('\n');
  if (lines.at(-1) === '') lines.pop();
  if (lines.length < recordCount) throw new Error('ledger does not contain the checkpoint prefix');
  return Buffer.from(lines.slice(0, recordCount).join('\n') + '\n');
}

function checkedDirectory(directory, create = false) {
  const target = path.resolve(directory);
  if (create) fs.mkdirSync(target, { recursive: true, mode: 0o700 });
  const stat = fs.lstatSync(target);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('replica location must be a real directory, not a symlink');
  if (create) fs.chmodSync(target, 0o700);
  return target;
}

function regularFile(directory, name) {
  const filename = path.join(directory, name);
  const stat = fs.lstatSync(filename);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('replication contains a non-regular file: ' + name);
  return filename;
}

function writeExclusive(destination, bytes) {
  let fd;
  try {
    fd = fs.openSync(destination, 'wx', 0o600);
    fs.writeFileSync(fd, bytes);
    fs.fsyncSync(fd);
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
  const copied = fs.readFileSync(destination);
  if (sha256(copied) !== sha256(bytes)) throw new Error('replica copy digest mismatch: ' + path.basename(destination));
}

function writeLatestAtomic(directory, bytes) {
  const target = path.join(directory, 'latest.json');
  const temporary = path.join(directory, '.latest-replica-' + process.pid + '-' + Date.now() + '.tmp');
  let fd;
  try {
    fd = fs.openSync(temporary, 'wx', 0o600);
    fs.writeFileSync(fd, bytes);
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

function readLatest(directory) {
  const filename = regularFile(directory, 'latest.json');
  const bytes = fs.readFileSync(filename);
  return { bytes, value: JSON.parse(bytes.toString('utf8')) };
}

export function replicateDurableEvidenceStore(sourceDirectory, replicaDirectory, ledgerBytes) {
  if (!Buffer.isBuffer(ledgerBytes)) throw new TypeError('ledgerBytes must be a Buffer');
  const source = checkedDirectory(sourceDirectory);
  const replica = checkedDirectory(replicaDirectory, true);
  if (source === replica) throw new Error('source and replica directories must be different');

  const sourceCheck = recoverDurableEvidenceStore(source, ledgerBytes);
  const sourceLatest = readLatest(source);
  const sourceSequence = sourceLatest.value.sequence;
  if (sourceCheck.checkpointCount !== sourceSequence) throw new Error('source manifest sequence does not match verified history');

  let replicaSequence = 0;
  const replicaLatestPath = path.join(replica, 'latest.json');
  if (fs.existsSync(replicaLatestPath)) {
    const current = readLatest(replica);
    const checked = verifyDurableEvidenceStore(replica, ledgerBytes);
    if (!checked.valid) throw new Error('existing replica is invalid: ' + checked.error);
    replicaSequence = current.value.sequence;
    if (replicaSequence > sourceSequence) throw new Error('replica is ahead of source; refusing rollback');
  } else {
    const orphaned = fs.readdirSync(replica).filter(name => /^checkpoint-\d{8}\.json$/.test(name) || /^ledger-\d{8}\.jsonl$/.test(name));
    if (orphaned.length) throw new Error('replica has orphaned files without a latest manifest');
  }

  for (let sequence = 1; sequence <= replicaSequence; sequence += 1) {
    const checkpoint = checkpointName(sequence);
    const sourceCheckpoint = regularFile(source, checkpoint);
    const replicaCheckpoint = regularFile(replica, checkpoint);
    if (sha256(fs.readFileSync(sourceCheckpoint)) !== sha256(fs.readFileSync(replicaCheckpoint))) {
      throw new Error('replica history diverges at ' + checkpoint);
    }
    const sourceLedger = ledgerPrefix(ledgerBytes, JSON.parse(fs.readFileSync(sourceCheckpoint, 'utf8')).recordCount);
    const replicaLedger = fs.readFileSync(regularFile(replica, ledgerName(sequence)));
    if (sha256(sourceLedger) !== sha256(replicaLedger)) throw new Error('replica ledger history diverges at sequence ' + sequence);
  }

  for (let sequence = replicaSequence + 1; sequence <= sourceSequence; sequence += 1) {
    const checkpoint = checkpointName(sequence);
    const checkpointBytes = fs.readFileSync(regularFile(source, checkpoint));
    const checkpointValue = JSON.parse(checkpointBytes.toString('utf8'));
    const prefix = ledgerPrefix(ledgerBytes, checkpointValue.recordCount);
    if (sha256(prefix) !== checkpointValue.ledgerSha256) throw new Error('source ledger prefix digest mismatch at sequence ' + sequence);
    writeExclusive(path.join(replica, checkpoint), checkpointBytes);
    writeExclusive(path.join(replica, ledgerName(sequence)), prefix);
  }

  writeLatestAtomic(replica, sourceLatest.bytes);
  const finalCheck = verifyDurableEvidenceStore(replica, ledgerBytes);
  if (!finalCheck.valid || finalCheck.checkpointCount !== sourceSequence) {
    throw new Error('replica verification failed: ' + (finalCheck.error || 'checkpoint count mismatch'));
  }
  return {
    replicated: true,
    checkpointCount: finalCheck.checkpointCount,
    recordCount: finalCheck.recordCount,
    tailHash: finalCheck.tailHash,
    sourceManifestHash: sourceLatest.value.manifestHash,
    replicaDirectory: replica
  };
}

export function recoverFromDurableEvidenceReplica(replicaDirectory, ledgerBytes) {
  const replica = checkedDirectory(replicaDirectory);
  let bytes = ledgerBytes;
  if (bytes === undefined) {
    const latest = readLatest(replica).value;
    const checkpoint = JSON.parse(fs.readFileSync(regularFile(replica, checkpointName(latest.sequence)), 'utf8'));
    bytes = fs.readFileSync(regularFile(replica, ledgerName(latest.sequence)));
    if (sha256(bytes) !== checkpoint.ledgerSha256) throw new Error('replica ledger digest does not match its checkpoint');
  }
  if (!Buffer.isBuffer(bytes)) throw new TypeError('ledgerBytes must be a Buffer when supplied');
  const result = recoverDurableEvidenceStore(replica, bytes);
  return { ...result, ledgerBytes: bytes, recoveredFromReplica: true };
}
