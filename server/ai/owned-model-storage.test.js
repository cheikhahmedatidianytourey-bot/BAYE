import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {saveOwnedModel,loadOwnedModel,listOwnedModels} from './owned-model-storage.js';
const artifact={algorithm:'multinomial-naive-bayes',version:'0.1.0',labels:['a','b'],vocabulary:['foo','bar'],counts:{a:{foo:2},b:{bar:2}},totals:{a:2,b:2},documents:{a:1,b:1},trainedOn:2};
test('model artifact persists, reloads and lists with integrity check',async()=>{const dir=await mkdtemp(path.join(os.tmpdir(),'baye-model-'));const prior=process.env.BAYE_OWNED_MODEL_DIR;process.env.BAYE_OWNED_MODEL_DIR=dir;try{const s=await saveOwnedModel(artifact);assert.equal(s.status,'saved');assert.deepEqual(await loadOwnedModel(s.id),artifact);assert.equal((await listOwnedModels()).items.length,1);}finally{if(prior===undefined)delete process.env.BAYE_OWNED_MODEL_DIR;else process.env.BAYE_OWNED_MODEL_DIR=prior;await rm(dir,{recursive:true,force:true});}});
test('rejects malformed artifact',async()=>{assert.equal((await saveOwnedModel({})).status,'rejected');});
