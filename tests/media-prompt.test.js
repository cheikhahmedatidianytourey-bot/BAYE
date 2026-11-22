import test from 'node:test';
import assert from 'node:assert/strict';
import {buildVideoPrompt} from '../src/media-prompt.js';
test('adds realistic direction while preserving the requested scene',()=>{
 const result=buildVideoPrompt({prompt:'A woman walks through Dakar at sunrise.'});
 assert.match(result,/A woman walks through Dakar at sunrise/);
 assert.match(result,/highly photorealistic live-action footage/);
 assert.match(result,/natural skin texture and pores/);
 assert.match(result,/maintain the same identity/);
});
test('human and character continuity instructions are configurable',()=>{
 const result=buildVideoPrompt({prompt:'Ocean waves at sunset.',humanFocus:false,characterConsistency:false});
 assert.doesNotMatch(result,/natural skin texture/);
 assert.doesNotMatch(result,/same identity/);
});
test('documentary style and empty prompts',()=>{
 assert.match(buildVideoPrompt({prompt:'Market.',videoLook:'documentary'}),/observational documentary/);
 assert.equal(buildVideoPrompt({prompt:'  '}),'');
});

test('caps the original scene description before adding realism directions',()=>{\n const long='x'.repeat(3000);\n const result=buildVideoPrompt({prompt:long});\n assert.ok(result.startsWith('x'.repeat(1200)));\n assert.ok(result.length<2048);\n});\n