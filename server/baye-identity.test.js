import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBayeCorePrompt, getBayeIdentity } from './baye-core.js';

test('BAYE official identity is configured with creator and company', () => {
  assert.deepEqual(getBayeIdentity(), {
    product: 'BAYE',
    creator: 'CHEIKH AHMED TIDIANE TOURE',
    company: 'WEMAD',
    tagline: 'Une technologie au service des idées.'
  });
});

test('core prompt consistently identifies BAYE creator and distinguishes AI provider', () => {
  const prompt = buildBayeCorePrompt('Texte');
  assert.match(prompt, /CHEIKH AHMED TIDIANE TOURE/);
  assert.match(prompt, /WEMAD/);
  assert.match(prompt, /Never attribute BAYE creation or ownership to an external AI model or provider/);
  assert.match(prompt, /Providers power specific inference requests only; they are not BAYE creator/);
});
