import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { verifyDurableEvidenceStore, recoverDurableEvidenceStore } from './snapshot-integrity-evidence-recovery.mjs';

const sha256 = value => createHash('sha256').update(value).digest('hex');
const checkpointName = sequence => 'checkpoint-' + String(sequence).padStart(8, '0') + '.json';
const ledgerName = sequence => 'ledger-' + String(sequence).padStart(8, '0') + '.jsonl';

function ledgerPrefix(ledgerBytes, recordCount) {
  const text = ledgerBytes.toString('utf8');
  const lines = text.split('\\n');
  if (lines.at(-1) === '') lines.pop();
  if (lines.length < recordCount) throw new Error('ledger does not contain the checkpoint prefix');
  return Buffer.from(lines.slice(0, recordCount).join('\\n') + '\\n');
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
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('replication source contains a non-regular file: ' + name);
  return filename;
}

function copyExclusive(source, destination) {
  const bytes = fs.readFileSync(source);
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
  return { filename, bytes: fs.readFileSync(filename), value: JSON.parse(fs.readFileSync(filename, 'utf8')) };
}

/**
 * Replicates a verified local evidence history into a second independently managed
 * directory. Existing generations are never overwritten; a replica can only advance.
 */
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
    const orphaned = fs.readdirSync(replica).filter(name => /^checkpoint-\\d{8}\\.json$/.test(name));
    if (orphaned.length) throw new Error('replica has orphaned checkpoint files without a latest manifest');
  }

  for (let sequence = 1; sequence <= replicaSequence; sequence += 1) {
    const name = checkpointName(sequence);
    const sourceFile = regularFile(source, name);
    const replicaFile = regularFile(replica, name);
    if (sha256(fs.readFileSync(sourceFile)) !== sha256(fs.readFileSync(replicaFile))) {
      throw new Error('replica history diverges at ' + name);
    }
  }

  for (let sequence = replicaSequence + 1; sequence <= sourceSequence; sequence += 1) {
    const name = checkpointName(sequence);
    copyExclusive(regularFile(source, name), path.join(replica, name));
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

/** Recover from the replica alone after the primary store is unavailable. */
export function recoverFromDurableEvidenceReplica(replicaDirectory, ledgerBytes) {
  return recoverDurableEvidenceStore(checkedDirectory(replicaDirectory), ledgerBytes);
}
