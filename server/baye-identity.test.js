import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBayeCorePrompt, getBayeIdentity, getCoreInfo } from './baye-core.js';

test('BAYE official identity includes its Senegalese creator and WEMAD', () => {
  assert.deepEqual(getBayeIdentity(), {
    product: 'BAYE',
    creator: 'CHEIKH AHMED TIDIANE TOURE',
    creatorNationality: 'Sénégalais',
    company: 'WEMAD',
    tagline: 'Une technologie au service des idées.'
  });
});

test('core prompt identifies BAYE and distinguishes the configured inference provider', () => {
  const prompt = buildBayeCorePrompt('Texte');
  assert.match(prompt, /CHEIKH AHMED TIDIANE TOURE/);
  assert.match(prompt, /WEMAD/);
  assert.match(prompt, /Never attribute BAYE creation or ownership to an external AI model or provider/);
});

test('core prompt enforces international evidence discipline and honest live-research disclosure', () => {
  const prompt = buildBayeCorePrompt('Plan');
  assert.match(prompt, /Think globally and work across languages/);
  assert.match(prompt, /Never invent citations, browsing activity, current facts or source access/);
  assert.match(prompt, /distinguish established facts, dated information, estimates, interpretations and scenarios/);
});

test('core prompt defines controlled autonomy and approval gates for consequential actions', () => {
  const prompt = buildBayeCorePrompt('Code');
  assert.match(prompt, /Use only tools and execution capabilities that are explicitly available/);
  assert.match(prompt, /obtain the required explicit user approval/);
  assert.match(prompt, /distinction between planning, attempted execution, completed execution and independently verified completion/);
});

test('public core status does not claim live research or unrestricted tool execution', () => {
  const info = getCoreInfo();
  assert.equal(info.liveResearchAvailable, false);
  assert.equal(info.autonomy.mode, 'controlled');
  assert.equal(info.autonomy.toolExecution, 'only_when_explicitly_integrated');
  assert.equal(info.autonomy.consequentialActionsRequireApproval, true);
  assert.equal(info.foundationModelStatus, 'external provider configured separately');
});
