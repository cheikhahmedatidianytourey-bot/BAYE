import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAcademyRequest, buildAcademyInstruction, buildAcademyReviewInstruction } from './engine.js';
import { verifyGoldbachExample } from './math-checks.js';

test('accepts a valid Senegalese high-school mathematics request', () => {
  const result = validateAcademyRequest({
    subject: 'mathematics', level: 'secondary', program: 'senegal',
    mode: 'solve', language: 'fr', prompt: 'Résoudre x² - 5x + 6 = 0'
  });
  assert.equal(result.ok, true);
});

test('rejects an unknown subject', () => {
  const result = validateAcademyRequest({
    subject: 'unknown', level: 'secondary', program: 'senegal',
    mode: 'solve', language: 'fr', prompt: 'Question'
  });
  assert.equal(result.ok, false);
});

test('doctoral instructions distinguish proven results from conjectures', () => {
  const result = validateAcademyRequest({
    subject: 'mathematics', level: 'doctoral', program: 'international',
    mode: 'research', language: 'en', prompt: 'Discuss a proof strategy for the theorem.'
  });
  assert.equal(result.ok, true);
  const instruction = buildAcademyInstruction(result.value);
  assert.match(instruction, /conjecture ne devient jamais un théorème/i);
  assert.match(instruction, /formule asymptotique conjecturale/i);
  assert.match(instruction, /Ne conclus jamais « tout est correct »/i);
});

test('second-pass review is explicitly not independent', () => {
  const input = { prompt: 'Goldbach n=1000' };
  const review = buildAcademyReviewInstruction(input, 'Draft');
  assert.match(review, /PAS un vérificateur indépendant/i);
  assert.match(review, /Aucun contrôle mathématique déterministe/i);
});

test('Goldbach checker exhaustively verifies n=1000 as a finite instance', () => {
  const check = verifyGoldbachExample('Étudier la conjecture de Goldbach pour n=1000');
  assert.equal(check.status, 'finite_instance_checked');
  assert.equal(check.n, 1000);
  assert.equal(check.representationCount, 28);
  assert.deepEqual(check.pairs[0], [3, 997]);
  assert.deepEqual(check.pairs.at(-1), [491, 509]);
  assert.equal(check.provesConjecture, false);
});

test('Goldbach checker does not claim to verify the conjecture without an explicit even integer', () => {
  const check = verifyGoldbachExample('Expliquer la conjecture de Goldbach');
  assert.equal(check.status, 'not_run');
  assert.equal(check.provesConjecture, false);
});

test('unrelated prompts do not trigger a Goldbach computation', () => {
  assert.equal(verifyGoldbachExample('Résoudre 2x + 3 = 7'), null);
});

test('rejects empty prompts and unsupported language codes', () => {
  const base = { subject: 'french', level: 'middle', program: 'senegal', mode: 'learn', language: 'fr', prompt: ' ' };
  assert.equal(validateAcademyRequest(base).ok, false);
  assert.equal(validateAcademyRequest({ ...base, prompt: 'Bonjour', language: 'xx' }).ok, false);
});
