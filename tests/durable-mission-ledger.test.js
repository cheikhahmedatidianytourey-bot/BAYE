import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createMissionCheckpoint} from '../server/mission-checkpoint.js';
import {createDurableMissionLedger} from '../server/durable-mission-ledger.js';

const owner='owner_1',missionId='mission_1',graphDigest='sha256:abcd1234';
const cp=(revision,status='running')=>createMissionCheckpoint({missionId,graphDigest,status,revision,tasks:{task_1:{status:'pending',attempt:0,history:[]}},updatedAt:'2026-11-23T18:00:00.000Z'});
async function setup(t){const directory=await mkdtemp(join(tmpdir(),'baye-ledger-'));t.after(()=>rm(directory,{recursive:true,force:true}));return {directory,ledger:createDurableMissionLedger({directory})};}
test('durable ledger saves, loads and verifies chained revisions',async t=>{const {ledger}=await setup(t);await ledger.save({ownerId:owner,checkpoint:cp(0),expectedRevision:-1,graphDigest});assert.deepEqual(await ledger.load({ownerId:owner,missionId,graphDigest}),cp(0));const saved=await ledger.save({ownerId:owner,checkpoint:cp(1,'succeeded'),expectedRevision:0,graphDigest});assert.equal(saved.sequence,2);assert.equal((await ledger.verify({ownerId:owner,missionId})).revision,1);});
test('rejects revision conflicts and graph mismatch',async t=>{const {ledger}=await setup(t);await ledger.save({ownerId:owner,checkpoint:cp(0),expectedRevision:-1,graphDigest});await assert.rejects(()=>ledger.save({ownerId:owner,checkpoint:cp(1),expectedRevision:-1,graphDigest}),/Conflit/);await assert.rejects(()=>ledger.load({ownerId:owner,missionId,graphDigest:'wrongdigest'}),/Graphe/);});
test('detects ledger alteration',async t=>{const {directory,ledger}=await setup(t);await ledger.save({ownerId:owner,checkpoint:cp(0),expectedRevision:-1,graphDigest});const path=join(directory,owner,missionId+'.jsonl');const content=await readFile(path,'utf8');await writeFile(path,content.replace('pending','failed'));await assert.rejects(()=>ledger.verify({ownerId:owner,missionId}),/corrompu/);});
test('parallel stale writers are serialized and only one succeeds',async t=>{const {ledger}=await setup(t);await ledger.save({ownerId:owner,checkpoint:cp(0),expectedRevision:-1,graphDigest});const results=await Promise.allSettled([ledger.save({ownerId:owner,checkpoint:cp(1),expectedRevision:0,graphDigest}),ledger.save({ownerId:owner,checkpoint:cp(1),expectedRevision:0,graphDigest})]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected').length,1);});
