import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAcademyRequest, buildAcademyInstruction } from './engine.js';

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

test('supports doctoral research mode without claiming official curriculum ingestion', () => {
  const result = validateAcademyRequest({
    subject: 'mathematics', level: 'doctoral', program: 'international',
    mode: 'research', language: 'en', prompt: 'Discuss a proof strategy for the theorem.'
  });
  assert.equal(result.ok, true);
  const instruction = buildAcademyInstruction(result.value);
  assert.match(instruction, /ne fabrique ni citations/i);
  assert.match(instruction, /pas une preuve que tous ses documents officiels sont déjà disponibles/i);
});

test('rejects empty prompts and unsupported language codes', () => {
  const base = { subject: 'french', level: 'middle', program: 'senegal', mode: 'learn', language: 'fr', prompt: ' ' };
  assert.equal(validateAcademyRequest(base).ok, false);
  assert.equal(validateAcademyRequest({ ...base, prompt: 'Bonjour', language: 'xx' }).ok, false);
});
