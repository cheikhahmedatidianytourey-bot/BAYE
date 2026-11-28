// G81/G82: bounded repair validation orchestration backed by a trusted disposable sandbox host.
import { evaluateRepairGate } from './controlled-repair-gate.js';

const MAX_CHECKS = 2;
const MAX_TIMEOUT_MS = 240000;
const MAX_SUMMARY = 500;
const ALLOWED_CHECKS = new Set(['unit-tests', 'application-build', 'security-tests']);
const REQUIRED_CAPABILITIES = {
  isolatedExecution: true,
  disposableWorkspace: true,
  resourceLimitsEnforced: true,
  timeoutEnforced: true,
  networkAccess: false,
  hostFilesystemAccess: false,
  repositoryAccess: false
};

function validateChecks(checks) {
  if (!Array.isArray(checks) || checks.length < 1 || checks.length > MAX_CHECKS) {
    return { status: 'rejected', error: 'checks must contain 1–2 approved validation checks' };
  }
  const seen = new Set();
  for (const check of checks) {
    if (typeof check !== 'string' || !ALLOWED_CHECKS.has(check)) {
      return { status: 'rejected', error: 'validation check is not allow-listed or is not yet implemented' };
    }
    if (seen.has(check)) return { status: 'rejected', error: 'duplicate validation check' };
    seen.add(check);
  }
  return { status: 'validated', checks: [...checks] };
}

function validateAdapter(adapter) {
  if (!adapter || typeof adapter !== 'object' || typeof adapter.run !== 'function') {
    return 'an explicit sandbox host adapter is required';
  }
  const capabilities = adapter.capabilities;
  if (!capabilities || typeof capabilities !== 'object') return 'sandbox adapter capabilities are required';
  for (const [key, expected] of Object.entries(REQUIRED_CAPABILITIES)) {
    if (capabilities[key] !== expected) return 'sandbox adapter capability mismatch: ' + key;
  }
  return null;
}

function normalizeAdapterResult(raw, expectedChecks) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.checks)) {
    return { status: 'failed', error: 'sandbox adapter returned an invalid result' };
  }
  if (raw.checks.length !== expectedChecks.length) {
    return { status: 'failed', error: 'sandbox adapter returned an incomplete check set' };
  }
  const byId = new Map();
  for (const item of raw.checks) {
    if (!item || typeof item !== 'object' || typeof item.id !== 'string' ||
        !expectedChecks.includes(item.id) || byId.has(item.id) ||
        !['passed', 'failed', 'error'].includes(item.status)) {
      return { status: 'failed', error: 'sandbox adapter returned malformed check evidence' };
    }
    byId.set(item.id, {
      id: item.id,
      status: item.status,
      summary: typeof item.summary === 'string' ? item.summary.slice(0, MAX_SUMMARY) : ''
    });
  }
  if (expectedChecks.some(id => !byId.has(id))) {
    return { status: 'failed', error: 'sandbox adapter omitted a required check' };
  }
  const checks = expectedChecks.map(id => byId.get(id));
  const passed = checks.every(item => item.status === 'passed');
  return {
    status: passed && raw.status === 'passed' ? 'passed' : 'failed',
    checks,
    ...(typeof raw.error === 'string' ? { error: raw.error.slice(0, MAX_SUMMARY) } : {}),
    ...(typeof raw.sandboxId === 'string' ? { sandboxId: raw.sandboxId.slice(0, 120) } : {}),
    ...(typeof raw.cleanupStatus === 'string' ? { cleanupStatus: raw.cleanupStatus.slice(0, 40) } : {})
  };
}

export async function runRepairSandbox(input, adapter) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { status: 'rejected', error: 'input object required' };
  }
  const gate = evaluateRepairGate({
    proposal: input.proposal,
    humanApproval: input.humanApproval,
    testsPassed: input.testsPassed,
    diagnosisConfirmed: input.diagnosisConfirmed,
    backupVerified: input.backupVerified
  });
  if (gate.status !== 'eligible_for_manual_review') {
    return { status: 'blocked', blockers: gate.blockers || gate.errors || ['repair proposal was rejected'] };
  }
  const checkPlan = validateChecks(input.checks);
  if (checkPlan.status !== 'validated') return checkPlan;
  const adapterError = validateAdapter(adapter);
  if (adapterError) return { status: 'rejected', error: adapterError };

  const timeoutMs = input.timeoutMs === undefined ? 210000 : input.timeoutMs;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > MAX_TIMEOUT_MS) {
    return { status: 'rejected', error: 'timeoutMs must be an integer from 100 to 240000' };
  }

  const controller = new AbortController();
  let timer;
  const limits = Object.freeze({
    timeoutMs,
    memoryLimitMb: 2048,
    cpuCount: 1,
    sandboxRuntimeSeconds: 300,
    maxFiles: 8,
    maxPatchBytesPerFile: 12000,
    networkAccess: false,
    hostFilesystemAccess: false,
    repositoryAccess: false,
    workspace: 'disposable-only'
  });
  try {
    const execution = Promise.resolve().then(() => adapter.run({
      proposal: input.proposal,
      checks: checkPlan.checks,
      limits,
      signal: controller.signal
    }));
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error('sandbox orchestration timed out'));
      }, timeoutMs);
    });
    const raw = await Promise.race([execution, timeout]);
    const normalized = normalizeAdapterResult(raw, checkPlan.checks);
    return {
      ...normalized,
      proposalId: gate.proposalId,
      execution: {
        workspace: 'disposable',
        workspacePersisted: false,
        repositoryModified: false,
        patchesAppliedToRepository: false,
        automaticMerge: false
      },
      limits
    };
  } catch (error) {
    return {
      status: 'failed',
      error: String(error?.message || error).slice(0, MAX_SUMMARY),
      execution: {
        workspace: 'disposable',
        workspacePersisted: false,
        repositoryModified: false,
        patchesAppliedToRepository: false,
        automaticMerge: false
      },
      limits
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function getRepairSandboxStatus() {
  return {
    name: 'BAYE Repair Sandbox Orchestrator',
    milestone: 'G81',
    version: '0.2.0',
    mode: 'trusted host adapter; Render Sandbox integration supplied by G82',
    limits: {
      maxTimeoutMs: MAX_TIMEOUT_MS,
      defaultTimeoutMs: 210000,
      memoryLimitMb: 2048,
      cpuCount: 1,
      sandboxRuntimeSeconds: 300,
      maxChecks: MAX_CHECKS,
      maxFiles: 8,
      maxPatchBytesPerFile: 12000
    },
    requiresTrustedHostAdapter: true,
    adapterMustEnforceIsolation: true,
    builtInProcessExecution: false,
    networkAccess: false,
    hostFilesystemAccess: false,
    repositoryWriteAccess: false,
    appliesPatchesToRepository: false
  };
}
