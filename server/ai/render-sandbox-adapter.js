// G82: Render Sandboxes adapter. It only runs against a pre-provisioned, pinned snapshot.
import { Render } from '@renderinc/sdk';
import { validateRepairProposal } from './controlled-repair-gate.js';
import { runRepairSandbox } from './repair-sandbox-runner.js';

const MAX_FILES = 8;
const MAX_PATCH_BYTES = 12_000;
const MAX_OUTPUT = 4_000;
const PROJECT_DIR = '/workspace/BAYE';
const MAX_COMMAND_TIMEOUT_SECONDS = 45;
const APPLY_TIMEOUT_SECONDS = 15;
const SANDBOX_LIFETIME_SECONDS = 300;
const PLAN = '1c-2g';

const PREFLIGHT_SCRIPT = String.raw`import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const root = '/workspace/BAYE';
const expectedCommit = '__BAYE_EXPECTED_COMMIT__';
function fail(message) {
  process.stderr.write('BAYE snapshot preflight failed: ' + message + '\n');
  process.exit(1);
}
if (!fs.existsSync(root) || fs.realpathSync(root) !== root) fail('expected project root is missing or redirected');
const gitRoot = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: root, encoding: 'utf8' });
if (gitRoot.status !== 0 || gitRoot.stdout.trim() !== root) fail('snapshot is not a valid BAYE Git checkout');
const actualCommit = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' });
if (actualCommit.status !== 0 || actualCommit.stdout.trim() !== expectedCommit) fail('snapshot commit does not match the trusted expected BAYE revision');
const gitStatus = spawnSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: root, encoding: 'utf8' });
if (gitStatus.status !== 0 || gitStatus.stdout.trim()) fail('snapshot checkout must be clean');
// Verify critical checkout bytes against the immutable Git tree selected by G85.
// Git blob IDs bind each file to HEAD; SHA-256 fingerprints are emitted as bounded evidence.
const criticalFiles = [
  'package.json',
  'server/ai/render-sandbox-adapter.js',
  'server/ai/controlled-repair-gate.js',
  'server/ai/repair-sandbox-runner.js',
  'scripts/verify-snapshot-integrity.mjs',
  'server/ai/snapshot-integrity-manifest.json'
];
const fingerprints = [];
for (const relative of criticalFiles) {
  const absolute = path.join(root, relative);
  let stat;
  try { stat = fs.lstatSync(absolute); } catch { fail('critical snapshot file is missing: ' + relative); }
  if (!stat.isFile() || fs.realpathSync(absolute) !== absolute) fail('critical snapshot file is not a regular in-tree file: ' + relative);
  const committed = spawnSync('git', ['rev-parse', 'HEAD:' + relative], { cwd: root, encoding: 'utf8' });
  if (committed.status !== 0 || !/^[a-f0-9]{40,64}$/.test(committed.stdout.trim())) fail('critical snapshot file is not tracked by the pinned commit: ' + relative);
  const actual = spawnSync('git', ['hash-object', '--no-filters', '--', relative], { cwd: root, encoding: 'utf8' });
  if (actual.status !== 0 || actual.stdout.trim() !== committed.stdout.trim()) fail('critical snapshot file content differs from the pinned Git tree: ' + relative);
  const digest = createHash('sha256').update(fs.readFileSync(absolute)).digest('hex');
  fingerprints.push(relative + '=' + digest);
}
const manifestPath = path.join(root, 'server/ai/snapshot-integrity-manifest.json');
let integrityManifest;
try { integrityManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); }
catch { fail('versioned snapshot integrity manifest is missing or invalid JSON'); }
if (integrityManifest.schemaVersion !== 1 || integrityManifest.algorithm !== 'sha256' ||
    !Array.isArray(integrityManifest.files)) fail('unsupported snapshot integrity manifest schema');
const expectedManifestFiles = [
  'package.json',
  'server/ai/render-sandbox-adapter.js',
  'server/ai/controlled-repair-gate.js',
  'server/ai/repair-sandbox-runner.js',
  'scripts/verify-snapshot-integrity.mjs'
];
const manifestPaths = integrityManifest.files.map(item => item?.path);
if (manifestPaths.length !== expectedManifestFiles.length ||
    expectedManifestFiles.some(file => !manifestPaths.includes(file)) ||
    new Set(manifestPaths).size !== manifestPaths.length) fail('snapshot integrity manifest file set is incomplete or unexpected');
for (const item of integrityManifest.files) {
  if (!/^[a-f0-9]{64}$/.test(item?.sha256 || '')) fail('invalid SHA-256 in snapshot integrity manifest: ' + item?.path);
  const actual = createHash('sha256').update(fs.readFileSync(path.join(root, item.path))).digest('hex');
  if (actual !== item.sha256) fail('snapshot integrity manifest mismatch: ' + item.path);
}
const nodeMajor = Number(process.versions.node.split('.')[0]);
if (nodeMajor !== 24) fail('Node.js 24 is required');
const npm = spawnSync('npm', ['--version'], { cwd: root, encoding: 'utf8', timeout: 5000 });
if (npm.status !== 0 || !/^\d+\.\d+\.\d+/.test((npm.stdout || '').trim())) fail('npm is unavailable');
const packagePath = path.join(root, 'package.json');
if (!fs.existsSync(packagePath)) fail('package.json is missing');
const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
if (pkg.engines?.node !== '24.x') fail('package.json must require Node.js 24.x');
for (const script of ['test', 'build', 'test:security']) {
  if (typeof pkg.scripts?.[script] !== 'string' || !pkg.scripts[script].trim()) fail('required npm script is missing: ' + script);
}
if (!fs.existsSync(path.join(root, 'node_modules')) || !fs.statSync(path.join(root, 'node_modules')).isDirectory()) {
  fail('preinstalled node_modules directory is missing');
}
const forbidden = [];
function inspect(directory, relative = '') {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (['.git', 'node_modules', 'dist', 'coverage'].includes(entry.name)) continue;
    const rel = relative ? relative + '/' + entry.name : entry.name;
    if (/^\.env(?:$|\.)/i.test(entry.name) && !/^\.env\.(?:example|sample|template)$/i.test(entry.name)) forbidden.push(rel);
    if (/^(?:id_rsa|id_ed25519|.*\.(?:pem|key|p12|pfx))$/i.test(entry.name)) forbidden.push(rel);
    if (entry.isDirectory()) inspect(path.join(directory, entry.name), rel);
  }
}
inspect(root);
if (forbidden.length) fail('snapshot contains forbidden secret-like files: ' + forbidden.slice(0, 5).join(', '));
process.stdout.write('BAYE snapshot preflight passed: pinned commit and critical file fingerprints verified, clean checkout, Node 24, npm, dependencies and required scripts present; no secret-like files found\n' + fingerprints.join('\n') + '\n');
`;

const APPLY_SCRIPT = String.raw`import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const nl = String.fromCharCode(10);
const root = '/workspace/BAYE';
const manifest = JSON.parse(fs.readFileSync('/tmp/baye-repair-manifest.json', 'utf8'));
if (!Array.isArray(manifest) || manifest.length < 1 || manifest.length > 8) {
  throw new Error('invalid repair manifest');
}
const diffs = [];
for (const item of manifest) {
  const parts = typeof item?.path === 'string' ? item.path.split('/') : [];
  const filename = parts[2] || '';
  const safePath = parts.length === 3 && parts[0] === 'server' && parts[1] === 'ai' &&
    /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(filename) && filename.endsWith('.js');
  if (!item || !safePath || typeof item.patch !== 'string' ||
      Buffer.byteLength(item.patch, 'utf8') > 12000 || !item.patch.includes('@@')) {
    throw new Error('repair manifest entry rejected');
  }
  const lines = item.patch.split(nl);
  if (lines.some(line => line.startsWith('diff --git ') || line.startsWith('--- ') ||
      line.startsWith('+++ ') || line.startsWith('GIT binary patch') ||
      line.startsWith('rename from ') || line.startsWith('copy from '))) {
    throw new Error('patch must contain hunks only; file headers are generated by BAYE');
  }
  const header = item.operation === 'add'
    ? 'diff --git a/' + item.path + ' b/' + item.path + nl + 'new file mode 100644' + nl +
      '--- /dev/null' + nl + '+++ b/' + item.path + nl
    : item.operation === 'modify'
      ? 'diff --git a/' + item.path + ' b/' + item.path + nl +
        '--- a/' + item.path + nl + '+++ b/' + item.path + nl
      : null;
  if (!header) throw new Error('repair operation rejected');
  diffs.push(header + item.patch.trimEnd() + nl);
}
const patch = diffs.join('');
for (const args of [['apply', '--check'], ['apply']]) {
  const result = spawnSync('git', args, { cwd: root, input: patch, encoding: 'utf8', maxBuffer: 65536 });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || 'git apply failed').slice(0, 500));
  }
}
`;

function buildPreflightScript(expectedCommit) {
  return PREFLIGHT_SCRIPT.replace('__BAYE_EXPECTED_COMMIT__', expectedCommit);
}

function bounded(value, max = 500) {
  return String(value ?? '').slice(0, max);
}

function readConfig(env) {
  const required = ['RENDER_API_KEY', 'RENDER_WORKSPACE_ID', 'RENDER_SANDBOX_GROUP_ID', 'RENDER_SANDBOX_SNAPSHOT_ID', 'RENDER_SANDBOX_EXPECTED_COMMIT'];
  const missing = required.filter(key => typeof env[key] !== 'string' || !env[key].trim());
  if (missing.length) throw new Error('Render sandbox configuration missing: ' + missing.join(', '));
  if (!/^tea-[A-Za-z0-9]+$/.test(env.RENDER_WORKSPACE_ID)) {
    throw new Error('RENDER_WORKSPACE_ID must identify the intended Render workspace');
  }
  if (!/^[a-f0-9]{40}$/.test(env.RENDER_SANDBOX_EXPECTED_COMMIT)) {
    throw new Error('RENDER_SANDBOX_EXPECTED_COMMIT must be a full 40-character Git commit SHA');
  }
  if (env.RENDER_SANDBOX_PLAN && env.RENDER_SANDBOX_PLAN !== PLAN) {
    throw new Error('only the verified 1c-2g sandbox plan is supported by this adapter');
  }
  return {
    groupId: env.RENDER_SANDBOX_GROUP_ID,
    snapshotId: env.RENDER_SANDBOX_SNAPSHOT_ID,
    expectedCommit: env.RENDER_SANDBOX_EXPECTED_COMMIT
  };
}

function validateProposal(proposal) {
  const gate = validateRepairProposal(proposal);
  if (gate.status !== 'validated') throw new Error('repair proposal rejected: ' + gate.errors.join('; '));
  if (!Array.isArray(proposal.changes) || proposal.changes.length < 1 || proposal.changes.length > MAX_FILES) {
    throw new Error('repair proposal must contain 1–8 file changes');
  }
  return proposal.changes.map(change => {
    if (!change || typeof change.path !== 'string' ||
        !/^server\/ai\/[A-Za-z0-9][A-Za-z0-9._-]*\.js$/.test(change.path) ||
        !['add', 'modify'].includes(change.operation) ||
        typeof change.patch !== 'string' || !change.patch.trim() ||
        Buffer.byteLength(change.patch, 'utf8') > MAX_PATCH_BYTES) {
      throw new Error('repair proposal contains an unsupported path, operation or patch');
    }
    return { path: change.path, operation: change.operation, patch: change.patch };
  });
}

async function execute(sandboxes, sandboxId, command, signal) {
  const stream = await sandboxes.exec(sandboxId, command, undefined, signal);
  let exitCode;
  let output = '';
  for await (const event of stream) {
    if (event.type === 'output') {
      const remaining = MAX_OUTPUT - output.length;
      if (remaining > 0) output += event.data.slice(0, remaining);
    } else if (event.type === 'exit') {
      exitCode = event.exit_code;
    }
  }
  if (!Number.isInteger(exitCode)) throw new Error('sandbox execution ended without an exit event');
  return { exitCode, output: bounded(output, MAX_OUTPUT) };
}

async function terminateWithin(sandboxes, sandboxId, timeoutMs = 15_000) {
  let timer;
  try {
    await Promise.race([
      sandboxes.terminate(sandboxId),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('sandbox termination deadline exceeded')), timeoutMs);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function createRenderSandboxAdapter({ client, env = process.env } = {}) {
  const capabilities = Object.freeze({
    isolatedExecution: true,
    disposableWorkspace: true,
    resourceLimitsEnforced: true,
    timeoutEnforced: true,
    networkAccess: false,
    hostFilesystemAccess: false,
    repositoryAccess: false
  });

  return {
    capabilities,
    async run({ proposal, checks, limits, signal }) {
      let sandboxId;
      let primaryError;
      let cleanupError;
      const evidence = [];
      let sandboxes;

      try {
        if (signal?.aborted) throw new Error('sandbox execution aborted before creation');
        const config = readConfig(env);
        const changes = validateProposal(proposal);
        if (!Array.isArray(checks) || checks.length < 1 ||
            checks.some(check => !['unit-tests', 'application-build', 'security-tests'].includes(check))) {
          throw new Error('Render adapter supports only unit-tests, application-build and offline security-tests');
        }
        sandboxes = client || new Render().sandboxes;
        const sandbox = await sandboxes.create({
          sandboxGroupId: config.groupId,
          snapshotId: config.snapshotId,
          plan: PLAN,
          timeoutSeconds: SANDBOX_LIFETIME_SECONDS,
          idleTimeoutSeconds: SANDBOX_LIFETIME_SECONDS,
          networkPolicy: { type: 'deny-all' }
        });
        sandboxId = sandbox.id;
        if (!sandboxId) throw new Error('Render created a sandbox without returning an ID');

        await sandboxes.waitUntilRunning(sandboxId, { timeoutMs: 60_000, signal });
        await sandboxes.upload(
          sandboxId,
          '/tmp/baye-snapshot-preflight.mjs',
          Buffer.from(buildPreflightScript(config.expectedCommit), 'utf8'),
          undefined,
          { signal }
        );
        const preflight = await execute(
          sandboxes,
          sandboxId,
          'timeout -k 2 10s node /tmp/baye-snapshot-preflight.mjs',
          signal
        );
        if (preflight.exitCode !== 0) {
          throw new Error('pinned BAYE snapshot is not ready: ' + bounded(preflight.output));
        }

        await sandboxes.upload(
          sandboxId,
          '/tmp/baye-repair-manifest.json',
          Buffer.from(JSON.stringify(changes), 'utf8'),
          undefined,
          { signal }
        );
        await sandboxes.upload(
          sandboxId,
          '/tmp/baye-apply-repair.mjs',
          Buffer.from(APPLY_SCRIPT, 'utf8'),
          undefined,
          { signal }
        );

        const applied = await execute(
          sandboxes,
          sandboxId,
          'timeout -k 2 ' + APPLY_TIMEOUT_SECONDS + 's node /tmp/baye-apply-repair.mjs',
          signal
        );
        if (applied.exitCode !== 0) throw new Error('repair patch rejected in sandbox: ' + bounded(applied.output));

        const overallBudgetMs = Number.isInteger(limits?.timeoutMs) ? limits.timeoutMs : 180000;
        const checkTimeoutSeconds = Math.max(
          5,
          Math.min(MAX_COMMAND_TIMEOUT_SECONDS, Math.floor((overallBudgetMs - 90000) / checks.length / 1000))
        );
        for (const check of checks) {
          const command = check === 'unit-tests'
            ? 'timeout -k 2 ' + checkTimeoutSeconds + 's bash -lc \'cd ' + PROJECT_DIR + ' && npm test\''
            : check === 'application-build'
              ? 'timeout -k 2 ' + checkTimeoutSeconds + 's bash -lc \'cd ' + PROJECT_DIR + ' && npm run build\''
              : 'timeout -k 2 ' + checkTimeoutSeconds + 's bash -lc \'cd ' + PROJECT_DIR + ' && npm run test:security\'';
          try {
            const result = await execute(sandboxes, sandboxId, command, signal);
            evidence.push({
              id: check,
              status: result.exitCode === 0 ? 'passed' : 'failed',
              summary: result.exitCode === 0
                ? check + ' passed in disposable Render sandbox'
                : check + ' failed (exit ' + result.exitCode + '): ' + bounded(result.output, 350)
            });
          } catch (error) {
            evidence.push({ id: check, status: 'error', summary: bounded(error?.message || error) });
          }
        }
      } catch (error) {
        primaryError = error;
      } finally {
        if (sandboxId && sandboxes) {
          try {
            await terminateWithin(sandboxes, sandboxId);
          } catch (error) {
            cleanupError = error;
          }
        }
      }

      if (primaryError) {
        const summary = bounded(primaryError?.message || primaryError);
        return {
          status: 'failed',
          error: summary,
          sandboxId,
          cleanupStatus: sandboxId ? (cleanupError ? 'unconfirmed' : 'terminated') : 'not-created',
          checks: checks.map(id => ({ id, status: 'error', summary }))
        };
      }

      if (cleanupError) {
        const summary = 'sandbox termination not confirmed for ' + sandboxId + ': ' + bounded(cleanupError?.message || cleanupError, 250);
        return {
          status: 'failed',
          error: summary,
          sandboxId,
          cleanupStatus: 'unconfirmed',
          checks: evidence.length ? evidence : checks.map(id => ({ id, status: 'error', summary }))
        };
      }

      return {
        status: evidence.length === checks.length && evidence.every(item => item.status === 'passed') ? 'passed' : 'failed',
        sandboxId,
        cleanupStatus: 'terminated',
        checks: evidence
      };
    }
  };
}

export function getRenderSandboxAdapterStatus() {
  return {
    name: 'BAYE Render Sandbox Adapter',
    milestone: 'G87',
    provider: 'Render Sandboxes',
    sdkVersion: '1.11.0',
    mode: 'pinned snapshot; disposable microVM per validation',
    plan: PLAN,
    memoryLimitMb: 2048,
    cpuCount: 1,
    sandboxLifetimeSeconds: SANDBOX_LIFETIME_SECONDS,
    networkPolicy: 'deny-all',
    supportedChecks: ['unit-tests', 'application-build', 'security-tests'],
    requires: [
      'RENDER_API_KEY',
      'RENDER_WORKSPACE_ID',
      'RENDER_SANDBOX_GROUP_ID',
      'RENDER_SANDBOX_SNAPSHOT_ID',
      'RENDER_SANDBOX_EXPECTED_COMMIT'
    ],
    apiKeyInjectedIntoSandbox: false,
    appliesPatchesToRepository: false,
    snapshotModified: false,
    createsResourcesOnlyWhenRunIsCalled: true
  };
}

export async function runRepairSandboxOnRender(input, adapterOptions = {}) {
  return runRepairSandbox(input, createRenderSandboxAdapter(adapterOptions));
}
