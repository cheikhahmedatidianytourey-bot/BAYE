import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MissionStore } from './mission-store.js';
import { createMission } from './mission-engine.js';

async function fixture(t){const directory=await mkdtemp(join(tmpdir(),'baye-mission-lock-'));t.after(async()=>rm(directory,{recursive:true,force:true}));return {directory,a:await new MissionStore({directory}).init(),b:await new MissionStore({directory}).init()};}
const makeMission=()=>createMission({goal:'atomic update test',ownerRef:'test-user',constraints:{scope:'test'},tasks:[{id:'task-1',description:'First task'}]});

test('simultaneous cross-instance saves with same token: only one update wins',async t=>{
 const {a,b}=await fixture(t);const original=makeMission();await a.create(original);const token=original.updatedAt;
 const one={...original,goal:'writer one',updatedAt:new Date(Date.parse(token)+1000).toISOString()};
 const two={...original,goal:'writer two',updatedAt:new Date(Date.parse(token)+2000).toISOString()};
 const results=await Promise.allSettled([a.save(one,{expectedUpdatedAt:token}),b.save(two,{expectedUpdatedAt:token})]);
 assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
 assert.equal(results.filter(x=>x.status==='rejected').length,1);
 const final=await a.get(original.id);assert.ok(['writer one','writer two'].includes(final.goal));
});
test('lock allows a subsequent save after previous operation completes',async t=>{
 const {a,b}=await fixture(t);const original=makeMission();await a.create(original);
 const token=original.updatedAt;const update={...original,goal:'updated',updatedAt:new Date(Date.parse(token)+1000).toISOString()};
 await a.save(update,{expectedUpdatedAt:token});const later=await b.get(original.id);
 const next={...later,goal:'second update',updatedAt:new Date(Date.parse(later.updatedAt)+1000).toISOString()};
 await b.save(next,{expectedUpdatedAt:later.updatedAt});assert.equal((await a.get(original.id)).goal,'second update');
});
