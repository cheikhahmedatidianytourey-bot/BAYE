import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'server/ai/snapshot-integrity-manifest.json'), 'utf8'));

test('independent snapshot manifest verifier accepts the pinned critical files', t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'baye-integrity-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));

  for (const item of manifest.files) {
    const source = path.join(root, item.path);
    const target = path.join(temp, item.path);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
  }
  const manifestTarget = path.join(temp, 'server/ai/snapshot-integrity-manifest.json');
  fs.mkdirSync(path.dirname(manifestTarget), { recursive: true });
  fs.copyFileSync(path.join(root, 'server/ai/snapshot-integrity-manifest.json'), manifestTarget);

  const verifier = path.join(temp, 'scripts/verify-snapshot-integrity.mjs');
  const result = spawnSync(process.execPath, [verifier], { cwd: temp, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /manifest verified/);
});

test('independent snapshot manifest verifier rejects altered critical bytes', t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'baye-integrity-tamper-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));

  for (const item of manifest.files) {
    const source = path.join(root, item.path);
    const target = path.join(temp, item.path);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
  }
  const manifestTarget = path.join(temp, 'server/ai/snapshot-integrity-manifest.json');
  fs.mkdirSync(path.dirname(manifestTarget), { recursive: true });
  fs.copyFileSync(path.join(root, 'server/ai/snapshot-integrity-manifest.json'), manifestTarget);

  fs.appendFileSync(path.join(temp, 'server/ai/repair-sandbox-runner.js'), '\n// tampered\n');
  const verifier = path.join(temp, 'scripts/verify-snapshot-integrity.mjs');
  const result = spawnSync(process.execPath, [verifier], { cwd: temp, encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /SHA-256 mismatch/);
});
