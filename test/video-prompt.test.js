import test from 'node:test';
import assert from 'node:assert/strict';
import { buildVideoPrompt } from '../src/media-prompt.js';

test('video prompt builder trims and appends realism instructions',()=>{
 const p=buildVideoPrompt({prompt:'  A runner in the rain  '});
 assert.ok(p.startsWith('A runner in the rain'));
 assert.match(p,/photorealistic live-action footage/);
 assert.match(p,/natural lighting/);
});
test('video prompt builder handles missing or blank prompts',()=>{
 assert.equal(buildVideoPrompt({prompt:''}), '');
 assert.equal(buildVideoPrompt({prompt:null}), '');
 assert.equal(buildVideoPrompt({prompt:'   '}), '');
});
test('video prompt builder truncates subject to 1200 chars',()=>{
 const input='x'.repeat(1500);const p=buildVideoPrompt({prompt:input,humanFocus:false,characterConsistency:false});
 assert.ok(p.startsWith('x'.repeat(1200)));
 assert.ok(!p.startsWith('x'.repeat(1201)));
});
test('human focus and continuity flags toggle relevant prompt guidance',()=>{
 const enabled=buildVideoPrompt({prompt:'Scene',humanFocus:true,characterConsistency:true});
 assert.match(enabled,/Human subjects:/);assert.match(enabled,/Character continuity:/);
 const disabled=buildVideoPrompt({prompt:'Scene',humanFocus:false,characterConsistency:false});
 assert.doesNotMatch(disabled,/Human subjects:/);assert.doesNotMatch(disabled,/Character continuity:/);
});
test('documentary and cinematic modes choose distinct direction',()=>{
 const documentary=buildVideoPrompt({prompt:'Scene',videoLook:'documentary'});
 assert.match(documentary,/observational documentary/);
 const cinematic=buildVideoPrompt({prompt:'Scene',videoLook:'live-action'});
 assert.match(cinematic,/cinematic live-action photography/);
});
