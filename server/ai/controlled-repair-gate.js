// G80.1: lexical allowlist for repair targets. This module never applies patches or writes files.
const MAX_PATCH_BYTES = 12000;
const MAX_PATH = 240;
const MAX_REASON = 600;
const MAX_FILES = 8;
const ALLOWED_TARGET_DIRECTORY = 'server/ai';
const ALLOWED_FILENAME = /^[A-Za-z0-9][A-Za-z0-9._-]*\.js$/;
const SENSITIVE_FILENAME = /(?:^|[._-])(secret|secrets|credential|credentials|password|passwd|token|private|auth|security|crypto|permission|policy|config|workflow|deploy|\.env)(?:[._-]|$)/i;

function safePath(path) {
  if (typeof path !== 'string' || !path.trim() || path.length > MAX_PATH) return false;
  if (/[\\\u0000-\u001f\u007f:]/.test(path) || path.includes('%')) return false;
  const segments = path.split('/');
  if (segments.length !== 3 || segments[0] !== 'server' || segments[1] !== 'ai') return false;
  if (segments.some(segment => !segment || segment === '.' || segment === '..' || segment.startsWith('.'))) return false;
  const filename = segments[2];
  if (!ALLOWED_FILENAME.test(filename) || SENSITIVE_FILENAME.test(filename)) return false;
  return true;
}

export function validateRepairProposal(proposal) {
  if (!proposal || typeof proposal !== 'object' || Array.isArray(proposal)) {
    return { status: 'rejected', errors: ['proposal object required'] };
  }
  const errors = [];
  if (typeof proposal.id !== 'string' || !proposal.id.trim() || proposal.id.length > 120) errors.push('valid proposal id required');
  if (typeof proposal.incidentId !== 'string' || !proposal.incidentId.trim() || proposal.incidentId.length > 120) errors.push('incidentId required');
  if (typeof proposal.diagnosisCode !== 'string' || !proposal.diagnosisCode.trim() || proposal.diagnosisCode.length > 80) errors.push('diagnosisCode required');
  if (typeof proposal.reason !== 'string' || !proposal.reason.trim() || proposal.reason.length > MAX_REASON) errors.push('reason must contain 1–600 characters');
  if (!Array.isArray(proposal.changes) || proposal.changes.length < 1 || proposal.changes.length > MAX_FILES) {
    errors.push('changes must contain 1–8 files');
  } else {
    const seen = new Set();
    for (const [i, change] of proposal.changes.entries()) {
      if (!change || typeof change !== 'object' || !safePath(change.path)) {
        errors.push('change ' + i + ' target must be a direct JavaScript file inside server/ai');
        continue;
      }
      if (seen.has(change.path)) errors.push('duplicate change path');
      seen.add(change.path);
      if (change.operation !== 'modify' && change.operation !== 'add') errors.push('change ' + i + ' operation must be add or modify');
      if (typeof change.patch !== 'string' || !change.patch.trim() || Buffer.byteLength(change.patch, 'utf8') > MAX_PATCH_BYTES) {
        errors.push('change ' + i + ' patch is empty or exceeds 12KB');
      } else if (change.patch.includes('\u0000') || change.patch.split('\n').some(line => line.length > 2000)) {
        errors.push('change ' + i + ' patch contains unsupported content');
      }
    }
  }
  if (errors.length) return { status: 'rejected', errors };
  return {
    status: 'validated',
    proposalId: proposal.id,
    fileCount: proposal.changes.length,
    patchBytes: proposal.changes.reduce((total, change) => total + Buffer.byteLength(change.patch, 'utf8'), 0)
  };
}

export function evaluateRepairGate(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { status: 'rejected', errors: ['input object required'] };
  const checked = validateRepairProposal(input.proposal);
  if (checked.status !== 'validated') return checked;
  const blockers = [];
  if (input.humanApproval !== true) blockers.push('explicit human approval is required');
  if (input.testsPassed !== true) blockers.push('all required validation tests must pass');
  if (input.diagnosisConfirmed !== true) blockers.push('diagnosis must be confirmed against evidence');
  if (input.backupVerified !== true) blockers.push('a recoverable backup or rollback point must be verified');
  return {
    status: blockers.length ? 'blocked' : 'eligible_for_manual_review',
    proposalId: checked.proposalId,
    fileCount: checked.fileCount,
    blockers,
    execution: { applied: false, filesWritten: 0, requiresSeparateExecutionCapability: true },
    safety: { automaticExecution: false, networkAccess: false, repositoryWriteAccess: false },
    notice: 'Eligibility is not execution. This engine only evaluates a repair proposal; a separate authorized system and review are required to apply it.'
  };
}

export function getControlledRepairStatus() {
  return {
    name: 'BAYE Controlled Self-Repair Gate',
    milestone: 'G80.1',
    version: '0.2.0',
    mode: 'proposal validation and approval gating only',
    limits: { maxFiles: MAX_FILES, maxPatchBytesPerFile: MAX_PATCH_BYTES, allowedTargetDirectory: ALLOWED_TARGET_DIRECTORY, allowedFileType: '.js' },
    appliesPatches: false,
    writesFiles: false,
    networkAccess: false,
    repositoryWriteAccess: false
  };
}
