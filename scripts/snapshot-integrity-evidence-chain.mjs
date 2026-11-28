import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const ZERO_HASH = '0'.repeat(64);
const HASH_PATTERN = /^[a-f0-9]{64}$/;
export function sha256(value) { return createHash('sha256').update(value).digest('hex'); }
function canonicalEntry(entry) {
  return JSON.stringify({
    schemaVersion: entry.schemaVersion, sequence: entry.sequence,
    previousRecordHash: entry.previousRecordHash, evidenceFile: entry.evidenceFile,
    evidenceSha256: entry.evidenceSha256, commitSha: entry.commitSha
  });
}
export function createChainEntry(evidenceBytes, evidence, previousRecordHash = ZERO_HASH, sequence = 1, evidenceFile = 'evidence.json') {
  if (!Buffer.isBuffer(evidenceBytes)) throw new TypeError('evidenceBytes must be a Buffer');
  if (!HASH_PATTERN.test(previousRecordHash)) throw new Error('previousRecordHash must be a lowercase SHA-256 hash');
  if (!Number.isSafeInteger(sequence) || sequence < 1) throw new Error('sequence must be a positive safe integer');
  const entry = {
    schemaVersion: 1, sequence, previousRecordHash, evidenceFile,
    evidenceSha256: sha256(evidenceBytes),
    commitSha: typeof evidence?.commit?.sha === 'string' && /^[a-f0-9]{40}$/.test(evidence.commit.sha) ? evidence.commit.sha : null
  };
  entry.recordHash = sha256(canonicalEntry(entry));
  return entry;
}
export function verifyChain(entries, options = {}) {
  const anchor = options.expectedPreviousHash ?? ZERO_HASH;
  if (!HASH_PATTERN.test(anchor)) return { valid: false, checked: 0, error: 'expected previous hash is invalid' };
  if (!Array.isArray(entries) || entries.length === 0) return { valid: false, checked: 0, error: 'chain is empty or malformed' };
  let previous = anchor;
  for (let i = 0; i < entries.length; i += 1) {
    const e = entries[i];
    if (!e || e.schemaVersion !== 1 || e.sequence !== i + 1) return { valid: false, checked: i, error: 'invalid schema or sequence at entry ' + (i + 1) };
    if (e.previousRecordHash !== previous) return { valid: false, checked: i, error: 'previous-record link mismatch at entry ' + (i + 1) };
    if (!HASH_PATTERN.test(e.evidenceSha256 || '') || !HASH_PATTERN.test(e.recordHash || '')) return { valid: false, checked: i, error: 'invalid SHA-256 field at entry ' + (i + 1) };
    if (e.recordHash !== sha256(canonicalEntry(e))) return { valid: false, checked: i, error: 'record hash mismatch at entry ' + (i + 1) };
    previous = e.recordHash;
  }
  return { valid: true, checked: entries.length, tailHash: previous, error: null };
}
function readLedger(file) {
  if (!fs.existsSync(file)) return [];
  const raw = fs.readFileSync(file, 'utf8');
  if (!raw.trim()) return [];
  return raw.trimEnd().split('\n').map((line, i) => {
    try { return JSON.parse(line); } catch { throw new Error('invalid JSON in ledger line ' + (i + 1)); }
  });
}
function run() {
  const root = process.cwd();
  const dir = path.resolve(root, process.env.BAYE_EVIDENCE_OUTPUT_DIR || 'artifacts/snapshot-integrity-evidence');
  const ledger = path.join(dir, 'evidence-chain.jsonl');
  const anchor = process.env.BAYE_EVIDENCE_PREVIOUS_HASH || ZERO_HASH;
  const entries = readLedger(ledger);
  const state = entries.length === 0\n    ? { valid: true, checked: 0, tailHash: null, error: null }\n    : verifyChain(entries, { expectedPreviousHash: anchor });
  if (!state.valid) throw new Error('existing chain rejected: ' + state.error);
  if (process.argv.includes('--verify')) {
    process.stdout.write('BAYE evidence chain verified: ' + state.checked + ' record(s); tail=' + (state.tailHash || anchor) + '\n');
    return;
  }
  const files = fs.readdirSync(dir).filter(n => n.endsWith('.json') && n !== 'evidence-chain.json');
  if (files.length !== 1) throw new Error('expected exactly one evidence JSON file; found ' + files.length);
  const file = files[0];
  const bytes = fs.readFileSync(path.join(dir, file));
  const evidence = JSON.parse(bytes.toString('utf8'));
  const entry = createChainEntry(bytes, evidence, state.tailHash || anchor, entries.length + 1, file);
  const next = [...entries, entry];
  const checked = verifyChain(next, { expectedPreviousHash: anchor });
  if (!checked.valid) throw new Error('new chain entry rejected: ' + checked.error);
  fs.appendFileSync(ledger, JSON.stringify(entry) + '\n', { encoding: 'utf8', mode: 0o600 });
  process.stdout.write('BAYE evidence chain entry recorded: sequence=' + entry.sequence + ' hash=' + entry.recordHash + '\n');
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  try { run(); } catch (e) { process.stderr.write('BAYE evidence chain failed: ' + (e?.message || e) + '\n'); process.exitCode = 1; }
}
