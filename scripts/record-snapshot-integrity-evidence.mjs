import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const manifestRelative = 'server/ai/snapshot-integrity-manifest.json';
const outputDirectory = path.resolve(
  root,
  process.env.BAYE_EVIDENCE_OUTPUT_DIR || 'artifacts/snapshot-integrity-evidence'
);
const bounded = (value, max = 2000) => String(value ?? '').slice(0, max);
const sha256 = value => createHash('sha256').update(value).digest('hex');

const gitHead = spawnSync('git', ['rev-parse', 'HEAD'], {
  cwd: root,
  encoding: 'utf8',
  timeout: 5000
});
const gitCommit = gitHead.status === 0 ? gitHead.stdout.trim() : null;
const suppliedCommit = process.env.GITHUB_SHA || null;
const commitSha = gitCommit || suppliedCommit;
const commitShaValid = typeof commitSha === 'string' && /^[a-f0-9]{40}$/.test(commitSha);
const commitIdentityMatches = !gitCommit || !suppliedCommit || gitCommit === suppliedCommit;

const verification = spawnSync(
  process.execPath,
  [path.join(root, 'scripts/verify-snapshot-integrity.mjs')],
  { cwd: root, encoding: 'utf8', timeout: 15000, maxBuffer: 32768 }
);
const verificationPassed = verification.status === 0 && !verification.error &&
  commitShaValid && commitIdentityMatches;

let manifestBytes = null;
let manifest = null;
let manifestError = null;
try {
  manifestBytes = fs.readFileSync(path.join(root, manifestRelative));
  manifest = JSON.parse(manifestBytes.toString('utf8'));
} catch (error) {
  manifestError = bounded(error?.message || error, 500);
}

const allowedEvidencePaths = new Set([
  'package.json',
  'server/ai/render-sandbox-adapter.js',
  'server/ai/controlled-repair-gate.js',
  'server/ai/repair-sandbox-runner.js',
  'scripts/verify-snapshot-integrity.mjs'
]);
const fileEvidence = [];
if (Array.isArray(manifest?.files)) {
  for (const item of manifest.files) {
    const relative = typeof item?.path === 'string' ? item.path : '';
    const entry = { path: bounded(relative, 300), expectedSha256: item?.sha256 || null, actualSha256: null, matches: false };
    if (!allowedEvidencePaths.has(relative)) {
      entry.error = 'path is outside the approved integrity evidence scope';
      fileEvidence.push(entry);
      continue;
    }
    try {
      const bytes = fs.readFileSync(path.join(root, relative));
      entry.actualSha256 = sha256(bytes);
      entry.matches = entry.actualSha256 === item.sha256;
    } catch (error) {
      entry.error = bounded(error?.message || error, 300);
    }
    fileEvidence.push(entry);
  }
}

const runId = process.env.GITHUB_RUN_ID || 'local';
const runAttempt = process.env.GITHUB_RUN_ATTEMPT || '1';
const workflow = process.env.GITHUB_WORKFLOW || 'local';
const repository = process.env.GITHUB_REPOSITORY || null;
const serverUrl = process.env.GITHUB_SERVER_URL || 'https://github.com';
const runUrl = repository && process.env.GITHUB_RUN_ID
  ? serverUrl + '/' + repository + '/actions/runs/' + process.env.GITHUB_RUN_ID
  : null;

const evidence = {
  schemaVersion: 1,
  evidenceType: 'baye.snapshot-integrity-verification',
  generatedAt: new Date().toISOString(),
  commit: {
    sha: commitShaValid ? commitSha : null,
    sourceSha: suppliedCommit,
    gitHeadSha: gitCommit,
    identityMatches: commitIdentityMatches
  },
  source: {
    provider: process.env.GITHUB_ACTIONS === 'true' ? 'github-actions' : 'local',
    repository,
    workflow,
    eventName: process.env.GITHUB_EVENT_NAME || null,
    ref: process.env.GITHUB_REF || null,
    runId,
    runAttempt,
    runUrl
  },
  manifest: {
    path: manifestRelative,
    sha256: manifestBytes ? sha256(manifestBytes) : null,
    schemaVersion: manifest?.schemaVersion ?? null,
    algorithm: manifest?.algorithm ?? null,
    error: manifestError
  },
  verification: {
    status: verificationPassed ? 'passed' : 'failed',
    exitCode: Number.isInteger(verification.status) ? verification.status : null,
    commitIdentityMatches,
    stdout: bounded(verification.stdout),
    stderr: bounded(verification.stderr || verification.error?.message)
  },
  files: fileEvidence
};

fs.mkdirSync(outputDirectory, { recursive: true });
const filenameCommit = commitShaValid ? commitSha : 'unresolved-commit';
const filename = filenameCommit + '-' + String(runId).replace(/[^A-Za-z0-9._-]/g, '_') +
  '-' + String(runAttempt).replace(/[^A-Za-z0-9._-]/g, '_') + '-' + Date.now() + '.json';
const evidencePath = path.join(outputDirectory, filename);
fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2) + '\n', {
  encoding: 'utf8',
  flag: 'wx',
  mode: 0o600
});

process.stdout.write(
  'BAYE integrity evidence recorded: ' + path.relative(root, evidencePath) +
  '\nCommit: ' + (commitShaValid ? commitSha : 'unresolved') +
  '\nVerification: ' + evidence.verification.status +
  '\nManifest files: ' + fileEvidence.length + '\n'
);
if (!verificationPassed) process.exitCode = 1;
