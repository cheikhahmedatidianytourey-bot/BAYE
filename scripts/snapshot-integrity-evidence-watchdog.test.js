import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createReplicationWatchdog } from './snapshot-integrity-evidence-watchdog.mjs';
import { createChainEntry, ZERO_HASH } from './snapshot-integrity-evidence-chain.mjs';
import { persistDurableCheckpoint } from './snapshot-integrity-evidence-recovery.mjs';
import { replicateDurableEvidenceStore } from './snapshot-integrity-evidence-replication.mjs';

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'baye-g94-watchdog-'));
  const dirs = {};
  for (const name of ['primary', 'replica', 'journal']) {
    dirs[name] = path.join(root, name);
    fs.mkdirSync(dirs[name]);
  }
  const primaryLedgerFile = path.join(root, 'primary-ledger.jsonl');
  const replicaLedgerFile = path.join(root, 'replica-ledger.jsonl');
  fs.writeFileSync(primaryLedgerFile, '{"primary":true}\n');
  fs.writeFileSync(replicaLedgerFile, '{"replica":true}\n');
  return {
    root, dirs, primaryLedgerFile, replicaLedgerFile,
    config: {
      primaryDirectory: dirs.primary, replicaDirectory: dirs.replica,
      journalDirectory: dirs.journal, primaryLedgerFile, replicaLedgerFile,
      intervalMs: 60_000
    }
  };
}
const report = (status, sequence = 1) => ({
  status, healthy: status === 'healthy',
  journal: { sequence, entryHash: String(sequence).padStart(64, '0') },
  findings: [status]
});

test('runs immediately, persists incident state and resumes counters after restart', async () => {
  const f = fixture();
  try {
    let current = report('replication_lag');
    const monitor = () => current;
    const first = createReplicationWatchdog(f.config, { monitor, now: () => '2026-11-28T13:00:00.000Z' });
    const started = await first.start();
    assert.equal(started.started, true);
    assert.equal(started.lastResult.status, 'replication_lag');
    assert.equal(started.state.consecutiveFailures, 1);
    assert.equal(started.state.totalCycles, 1);
    await first.stop();

    current = report('healthy', 2);
    const second = createReplicationWatchdog(f.config, { monitor: () => current, now: () => '2026-11-28T13:05:00.000Z' });
    const resumed = await second.start();
    assert.equal(resumed.state.totalCycles, 2);
    assert.equal(resumed.state.consecutiveFailures, 0);
    assert.equal(resumed.state.firstUnresolvedAt, null);
    assert.equal(resumed.state.lastHealthyAt, '2026-11-28T13:05:00.000Z');
    await second.stop();
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});

test('prevents overlapping checks and returns the same in-flight result', async () => {
  const f = fixture();
  try {
    let calls = 0;
    let release;
    const monitor = async () => {
      calls += 1;
      await new Promise(resolve => { release = resolve; });
      return report('healthy');
    };
    const watchdog = createReplicationWatchdog(f.config, { monitor });
    const first = watchdog.runOnce();
    const second = watchdog.runOnce();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(calls, 1);
    release();
    const [a, b] = await Promise.all([first, second]);
    assert.equal(a.status, 'healthy');
    assert.equal(b.status, 'healthy');
    assert.equal(calls, 1);
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});

test('rejects invalid intervals and symbolic-link evidence inputs', () => {
  const f = fixture();
  try {
    assert.throws(() => createReplicationWatchdog({ ...f.config, intervalMs: 1000 }), /intervalMs/);
    const linked = path.join(f.root, 'linked-ledger');
    fs.symlinkSync(f.primaryLedgerFile, linked);
    assert.throws(() => createReplicationWatchdog({ ...f.config, primaryLedgerFile: linked }), /regular file/);
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});

test('does not overwrite a malformed persisted watch state', async () => {
  const f = fixture();
  try {
    const stateFile = path.join(f.dirs.journal, 'replication-watch-state.json');
    fs.writeFileSync(stateFile, '{"schemaVersion":1,"status":"bad"}');
    assert.throws(() => createReplicationWatchdog({ ...f.config, stateFile }), /malformed/);
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});

test('persists watchdog execution exceptions as monitor_error incidents and counters', async () => {
  const f = fixture();
  try {
    const stateFile = path.join(f.dirs.journal, 'watch-state.json');
    const failingMonitor = async () => { throw new Error('simulated G93 journal lock failure'); };
    const first = createReplicationWatchdog({ ...f.config, stateFile }, { monitor: failingMonitor, now: () => '2026-11-28T14:00:00.000Z' });
    const a = await first.start();
    assert.equal(a.lastResult.status, 'monitor_error');
    assert.equal(a.state.status, 'monitor_error');
    assert.equal(a.state.consecutiveFailures, 1);
    assert.equal(a.state.totalCycles, 1);
    assert.match(a.lastResult.error, /journal lock failure/);
    await first.stop();

    const second = createReplicationWatchdog({ ...f.config, stateFile }, { monitor: failingMonitor, now: () => '2026-11-28T14:05:00.000Z' });
    const b = await second.start();
    assert.equal(b.state.consecutiveFailures, 2);
    assert.equal(b.state.totalCycles, 2);
    assert.equal(b.state.status, 'monitor_error');
    await second.stop();
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});

test('integrates watchdog with the real G93 health monitor and evidence replication', async () => {
  const f = fixture();
  try {
    const bytes = Buffer.from([
      JSON.stringify(createChainEntry(Buffer.from('real G93 integration'), { commit: { sha: 'a'.repeat(40) } }, ZERO_HASH, 1, 'evidence-1.json'))
    ].join('') + '\\n');
    fs.writeFileSync(f.primaryLedgerFile, bytes);
    fs.writeFileSync(f.replicaLedgerFile, bytes);
    persistDurableCheckpoint(f.dirs.primary, bytes);
    replicateDurableEvidenceStore(f.dirs.primary, f.dirs.replica, bytes);
    const watchdog = createReplicationWatchdog(f.config, { now: () => '2026-11-28T14:10:00.000Z' });
    const result = await watchdog.start();
    assert.equal(result.lastResult.status, 'healthy');
    assert.equal(result.state.totalCycles, 1);
    assert.equal(result.state.consecutiveFailures, 0);
    await watchdog.stop();
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});
