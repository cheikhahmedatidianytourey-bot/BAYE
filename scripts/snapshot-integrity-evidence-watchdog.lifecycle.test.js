import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createReplicationWatchdog } from './snapshot-integrity-evidence-watchdog.mjs';

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'baye-g95-watchdog-lifecycle-'));
  const dirs = {};
  for (const name of ['primary', 'replica', 'journal']) {
    dirs[name] = path.join(root, name);
    fs.mkdirSync(dirs[name]);
  }
  const primaryLedgerFile = path.join(root, 'primary-ledger.jsonl');
  const replicaLedgerFile = path.join(root, 'replica-ledger.jsonl');
  fs.writeFileSync(primaryLedgerFile, 'primary\n');
  fs.writeFileSync(replicaLedgerFile, 'replica\n');
  return {
    root, dirs, primaryLedgerFile, replicaLedgerFile,
    config: {
      primaryDirectory: dirs.primary, replicaDirectory: dirs.replica,
      journalDirectory: dirs.journal, primaryLedgerFile, replicaLedgerFile,
      intervalMs: 60_000
    }
  };
}
const healthy = () => ({
  status: 'healthy', healthy: true,
  journal: { sequence: 1, entryHash: 'a'.repeat(64) },
  findings: ['healthy']
});

test('stop waits for an active watchdog cycle before returning', async () => {
  const f = fixture();
  try {
    let release;
    let notifyStarted;
    const started = new Promise(resolve => { notifyStarted = resolve; });
    const gate = new Promise(resolve => { release = resolve; });
    const watchdog = createReplicationWatchdog(f.config, {
      monitor: async () => { notifyStarted(); await gate; return healthy(); }
    });
    const cycle = watchdog.runOnce();
    await started;
    let stopped = false;
    const stopping = watchdog.stop().then(result => { stopped = true; return result; });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(stopped, false, 'stop must not resolve while a cycle is in flight');
    release();
    const [result, stopResult] = await Promise.all([cycle, stopping]);
    assert.equal(result.status, 'healthy');
    assert.equal(stopResult.stopped, true);
    assert.equal(stopped, true);
    assert.equal(stopResult.state.totalCycles, 1);
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});

test('start is idempotent while running and restart is possible after stop', async () => {
  const f = fixture();
  try {
    let calls = 0;
    const watchdog = createReplicationWatchdog(f.config, { monitor: async () => { calls += 1; return healthy(); } });
    const first = await watchdog.start({ immediate: false });
    assert.equal(first.started, true);
    assert.equal(watchdog.getStatus().running, true);
    const duplicate = await watchdog.start({ immediate: false });
    assert.equal(duplicate.started, false);
    assert.equal(duplicate.reason, 'already_running');
    await watchdog.stop();
    assert.equal(watchdog.getStatus().running, false);
    const restarted = await watchdog.start({ immediate: false });
    assert.equal(restarted.started, true);
    await watchdog.stop();
    assert.equal(calls, 0, 'non-immediate starts must not execute a monitor cycle');
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});
