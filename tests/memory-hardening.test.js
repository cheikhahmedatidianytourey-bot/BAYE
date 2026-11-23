import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {PersistentMissionMemoryStore} from '../server/mission-memory-store.js';
import {runAuthenticatedOrchestration} from '../server/authenticated-orchestration.js';

test('store rejects oversized serialized payload before writing',async()=>{const dir=await fs.mkdtemp(path.join(os.tmpdir(),'baye-size-'));try{const store=new PersistentMissionMemoryStore({filePath:path.join(dir,'store.json')});await assert.rejects(()=>store.writeAll([{oversized:'x'.repeat(4*1024*1024)}]),/size limit/i);assert.equal(await fs.access(store.filePath).then(()=>true,()=>false),false);}finally{await fs.rm(dir,{recursive:true,force:true});}});
test('store rejects records with implausibly future timestamps',async()=>{const dir=await fs.mkdtemp(path.join(os.tmpdir(),'baye-time-'));try{const store=new PersistentMissionMemoryStore({filePath:path.join(dir,'store.json')});await fs.writeFile(store.filePath,JSON.stringify({version:1,records:[{ownerKey:'a'.repeat(64),missionId:'mission_12345678',updatedAt:new Date(Date.now()+3600000).toISOString(),memory:{}}]}));await assert.rejects(()=>store.readAll(),/corrupt|unsupported/i);}finally{await fs.rm(dir,{recursive:true,force:true});}});
test('authenticated successful result without valid memory packet is not persisted',async()=>{let saves=0;const store={load:async()=>null,save:async()=>{saves++;}};const result=await runAuthenticatedOrchestration({store,ownerId:'account:user-123456',run:async()=>({status:'succeeded'})});assert.equal(saves,0);assert.equal(result.memoryPersistence.status,'unavailable');});
test('authenticated mission rejects mismatched memory identifier for persistence',async()=>{let saved=0;const store={load:async()=>null,save:async()=>{saved++;}};const result=await runAuthenticatedOrchestration({store,ownerId:'account:user-123456',missionId:'mission_12345678',run:async()=>({status:'succeeded',missionMemory:{missionId:'mission_87654321'}})});assert.equal(saved,0);assert.equal(result.memoryPersistence.status,'unavailable');});
