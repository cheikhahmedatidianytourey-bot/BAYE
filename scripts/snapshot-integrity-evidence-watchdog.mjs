import fs from 'node:fs';
import path from 'node:path';
import { monitorEvidenceReplication, verifyReplicationHealthJournal } from './snapshot-integrity-evidence-health.mjs';

const MIN_INTERVAL_MS = 60_000;
const MAX_INTERVAL_MS = 3_600_000;
const DEFAULT_INTERVAL_MS = 300_000;

function readRegularFile(file, label) {
  const resolved = path.resolve(file);
  const stat = fs.lstatSync(resolved);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(label + ' must be a regular file, not a symlink');
  return fs.readFileSync(resolved);
}

function validateDirectory(directory, label) {
  const resolved = path.resolve(directory);
  const stat = fs.lstatSync(resolved);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(label + ' must be an existing real directory, not a symlink');
  return resolved;
}

function atomicWrite(file, value) {
  const directory = path.dirname(file);
  const temporary = path.join(directory, '.' + path.basename(file) + '.' + process.pid + '.tmp');
  let fd;
  try {
    fd = fs.openSync(temporary, 'wx', 0o600);
    fs.writeFileSync(fd, JSON.stringify(value) + '\n');
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    fs.renameSync(temporary, file);
    const dirFd = fs.openSync(directory, 'r');
    try { fs.fsyncSync(dirFd); } finally { fs.closeSync(dirFd); }
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
    try { fs.unlinkSync(temporary); } catch {}
  }
}

function loadState(file) {
  if (!fs.existsSync(file)) return { schemaVersion: 1, status: 'not_started', consecutiveFailures: 0, totalCycles: 0 };
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('watch state must be a regular file, not a symlink');
  const state = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!state || state.schemaVersion !== 1 || !Number.isSafeInteger(state.totalCycles) ||
      !Number.isSafeInteger(state.consecutiveFailures) || typeof state.status !== 'string') {
    throw new Error('watch state is malformed; refusing to overwrite it');
  }
  return state;
}

function saveState(file, previous, result, timestamp) {
  const healthy = result.status === 'healthy';
  const next = {
    schemaVersion: 1,
    status: result.status,
    consecutiveFailures: healthy ? 0 : previous.consecutiveFailures + 1,
    totalCycles: previous.totalCycles + 1,
    firstUnresolvedAt: healthy ? null : (previous.status === 'healthy' || previous.status === 'not_started' ? timestamp : previous.firstUnresolvedAt || timestamp),
    lastObservedAt: timestamp,
    lastHealthyAt: healthy ? timestamp : previous.lastHealthyAt || null,
    lastJournalSequence: result.journal.sequence,
    lastJournalHash: result.journal.entryHash
  };
  atomicWrite(file, next);
  return next;
}

export function createReplicationWatchdog(config, dependencies = {}) {
  if (!config || typeof config !== 'object') throw new TypeError('watchdog configuration is required');
  const primaryDirectory = validateDirectory(config.primaryDirectory, 'primary directory');
  const replicaDirectory = validateDirectory(config.replicaDirectory, 'replica directory');
  const journalDirectory = validateDirectory(config.journalDirectory, 'journal directory');
  const primaryLedgerFile = path.resolve(config.primaryLedgerFile);
  const replicaLedgerFile = path.resolve(config.replicaLedgerFile || config.primaryLedgerFile);
  const stateFile = path.resolve(config.stateFile || path.join(journalDirectory, 'replication-watch-state.json'));
  readRegularFile(primaryLedgerFile, 'primary ledger');
  readRegularFile(replicaLedgerFile, 'replica ledger');
  const intervalMs = config.intervalMs ?? DEFAULT_INTERVAL_MS;
  if (!Number.isSafeInteger(intervalMs) || intervalMs < MIN_INTERVAL_MS || intervalMs > MAX_INTERVAL_MS) {
    throw new RangeError('intervalMs must be between 60000 and 3600000');
  }
  const monitor = dependencies.monitor || monitorEvidenceReplication;
  const now = dependencies.now || (() => new Date().toISOString());
  let timer = null;
  let active = null;
  let stopped = true;
  let state = loadState(stateFile);
  let lastResult = null;

  async function runOnce() {
    if (active) return active;
    active = Promise.resolve().then(() => {
      const primaryLedger = readRegularFile(primaryLedgerFile, 'primary ledger');
      const replicaLedger = readRegularFile(replicaLedgerFile, 'replica ledger');
      const timestamp = now();
      const result = await monitor(primaryDirectory, replicaDirectory, primaryLedger, journalDirectory, { replicaLedgerBytes: replicaLedger, timestamp });
      state = saveState(stateFile, state, result, timestamp);
      lastResult = { ...result, watchState: state };
      return lastResult;
    }).finally(() => { active = null; });
    return active;
  }

  function scheduleNext() {
    if (stopped) return;
    timer = setTimeout(async () => {
      timer = null;
      try {
        await runOnce();
      } catch (error) {
        lastResult = { status: 'monitor_error', error: error.message, at: now() };
      }
      scheduleNext();
    }, intervalMs);
    if (typeof timer.unref === 'function') timer.unref();
  }

  async function start({ immediate = true } = {}) {
    if (!stopped) return { started: false, reason: 'already_running', intervalMs };
    stopped = false;
    if (immediate) {
      try { await runOnce(); }
      catch (error) {
        lastResult = { status: 'monitor_error', error: error.message, at: now() };
      }
    }
    scheduleNext();
    return { started: true, intervalMs, state, lastResult };
  }

  async function stop() {
    stopped = true;
    if (timer) clearTimeout(timer);
    timer = null;
    if (active) await active.catch(() => {});
    return { stopped: true, state };
  }

  function getStatus() {
    return { running: !stopped, intervalMs, state, lastResult, journal: verifyReplicationHealthJournal(journalDirectory) };
  }

  return { start, stop, runOnce, getStatus };
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error('missing required environment variable ' + name);
  return value;
}

async function main() {
  const config = {
    primaryDirectory: requiredEnv('BAYE_EVIDENCE_PRIMARY_DIR'),
    replicaDirectory: requiredEnv('BAYE_EVIDENCE_REPLICA_DIR'),
    primaryLedgerFile: requiredEnv('BAYE_EVIDENCE_PRIMARY_LEDGER'),
    replicaLedgerFile: process.env.BAYE_EVIDENCE_REPLICA_LEDGER || process.env.BAYE_EVIDENCE_PRIMARY_LEDGER,
    journalDirectory: requiredEnv('BAYE_EVIDENCE_HEALTH_JOURNAL_DIR'),
    stateFile: process.env.BAYE_EVIDENCE_WATCH_STATE_FILE,
    intervalMs: process.env.BAYE_EVIDENCE_WATCH_INTERVAL_MS === undefined
      ? DEFAULT_INTERVAL_MS : Number(process.env.BAYE_EVIDENCE_WATCH_INTERVAL_MS)
  };
  const watchdog = createReplicationWatchdog(config);
  const started = await watchdog.start();
  process.stdout.write(JSON.stringify({ event: 'watchdog_started', ...started }) + '\n');
  let stopping = false;
  const shutdown = async signal => {
    if (stopping) return;
    stopping = true;
    process.stdout.write(JSON.stringify({ event: 'watchdog_stopping', signal }) + '\n');
    await watchdog.stop();
    process.exitCode = 0;
  };
  process.once('SIGINT', () => { shutdown('SIGINT').catch(() => { process.exitCode = 1; }); });
  process.once('SIGTERM', () => { shutdown('SIGTERM').catch(() => { process.exitCode = 1; }); });
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath && invokedPath === path.resolve(new URL(import.meta.url).pathname)) {
  main().catch(error => {
    process.stderr.write('[BAYE G94] ' + error.message + '\n');
    process.exitCode = 1;
  });
}
