import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = 'server/ai/snapshot-integrity-manifest.json';
const manifest = JSON.parse(fs.readFileSync(path.join(root, manifestPath), 'utf8'));
const commitSha = 'a'.repeat(40);

function makeFixture(t, tamper = false) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'baye-evidence-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const paths = [
    ...manifest.files.map(item => item.path),
    manifestPath,
    'scripts/verify-snapshot-integrity.mjs',
    'scripts/record-snapshot-integrity-evidence.mjs'
  ];
  for (const relative of paths) {
    const source = path.join(root, relative);
    const target = path.join(temp, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
  }
  if (tamper) fs.appendFileSync(path.join(temp, 'server/ai/repair-sandbox-runner.js'), '\n// evidence tamper\n');
  return temp;
}

function runRecorder(temp) {
  const output = path.join(temp, 'evidence-output');
  const result = spawnSync(process.execPath, ['scripts/record-snapshot-integrity-evidence.mjs'], {
    cwd: temp,
    encoding: 'utf8',
    env: {
      ...process.env,
      GITHUB_SHA: commitSha,
      GITHUB_ACTIONS: 'true',
      GITHUB_REPOSITORY: 'example/BAYE',
      GITHUB_WORKFLOW: 'BAYE validation',
      GITHUB_EVENT_NAME: 'pull_request',
      GITHUB_REF: 'refs/pull/1/merge',
      GITHUB_RUN_ID: '12345',
      GITHUB_RUN_ATTEMPT: '2',
      GITHUB_SERVER_URL: 'https://github.com',
      BAYE_EVIDENCE_OUTPUT_DIR: output
    }
  });
  const files = fs.existsSync(output) ? fs.readdirSync(output) : [];
  assert.equal(files.length, 1, 'one durable evidence record should be written');
  const record = JSON.parse(fs.readFileSync(path.join(output, files[0]), 'utf8'));
  return { result, record };
}

test('records passing integrity evidence linked to commit and workflow run', t => {
  const temp = makeFixture(t);
  const { result, record } = runRecorder(temp);

  assert.equal(result.status, 0, result.stderr);
  assert.match(record.generatedAt, /^\d{4}-\d\d-\d\dT.*Z$/);
  assert.equal(record.schemaVersion, 1);
  assert.equal(record.evidenceType, 'baye.snapshot-integrity-verification');
  assert.equal(record.commit.sha, commitSha);
  assert.equal(record.commit.identityMatches, true);
  assert.equal(record.source.provider, 'github-actions');
  assert.equal(record.source.runId, '12345');
  assert.equal(record.source.runAttempt, '2');
  assert.equal(record.source.runUrl, 'https://github.com/example/BAYE/actions/runs/12345');
  assert.equal(record.verification.status, 'passed');
  assert.equal(record.files.length, manifest.files.length);
  assert.ok(record.files.every(item => item.matches && /^[a-f0-9]{64}$/.test(item.actualSha256)));
});

test('records failed integrity evidence instead of discarding tamper results', t => {
  const temp = makeFixture(t, true);
  const { result, record } = runRecorder(temp);

  assert.equal(result.status, 1);
  assert.equal(record.commit.sha, commitSha);
  assert.equal(record.verification.status, 'failed');
  assert.ok(record.files.some(item => item.path === 'server/ai/repair-sandbox-runner.js' && !item.matches));
  assert.match(record.verification.stderr, /SHA-256 mismatch/);
});
