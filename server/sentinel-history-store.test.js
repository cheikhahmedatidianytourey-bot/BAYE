import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {SentinelHistoryStore} from './sentinel-history-store.js';

test('SENTINEL history survives store reconstruction',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'baye-sentinel-history-'));
  const filePath=join(dir,'history.json');
  try {
    const first=new SentinelHistoryStore({filePath,maxEntries:3});
    const entries=[{checkedAt:'2026-11-22T10:00:00.000Z',overallOk:true,results:[{name:'backend',ok:true}]},{checkedAt:'2026-11-22T09:55:00.000Z',overallOk:false,results:[{name:'backend',ok:false}]}];
    await first.save(entries);
    const restarted=new SentinelHistoryStore({filePath,maxEntries:3});
    assert.deepEqual(await restarted.load(),entries);
  } finally { await rm(dir,{recursive:true,force:true}); }
});

test('SENTINEL history is bounded to configured maximum',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'baye-sentinel-limit-'));
  try {
    const store=new SentinelHistoryStore({filePath:join(dir,'history.json'),maxEntries:2});
    await store.save([
      {checkedAt:'2026-11-22T10:00:00.000Z',overallOk:true,results:[{name:'backend',ok:true}]},
      {checkedAt:'2026-11-22T09:55:00.000Z',overallOk:false,results:[{name:'backend',ok:false}]},
      {checkedAt:'2026-11-22T09:50:00.000Z',overallOk:true,results:[{name:'backend',ok:true}]}
    ]);
    assert.deepEqual(await store.load(),[
      {checkedAt:'2026-11-22T10:00:00.000Z',overallOk:true,results:[{name:'backend',ok:true}]},
      {checkedAt:'2026-11-22T09:55:00.000Z',overallOk:false,results:[{name:'backend',ok:false}]}
    ]);
  } finally { await rm(dir,{recursive:true,force:true}); }
});

test('SENTINEL store rejects malformed history values',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'baye-sentinel-invalid-'));
  try {
    const store=new SentinelHistoryStore({filePath:join(dir,'history.json')});
    await assert.rejects(store.save({not:'an array'}),/must be an array/);
  } finally { await rm(dir,{recursive:true,force:true}); }
});

test('SENTINEL load filters malformed persisted entries',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'baye-sentinel-filter-'));
  const filePath=join(dir,'history.json');
  try {
    const {writeFile}=await import('node:fs/promises');
    await writeFile(filePath,JSON.stringify([{id:'bad'},{checkedAt:'2026-11-22T10:00:00.000Z',overallOk:true,results:[{name:'backend',ok:true}]}]));
    const store=new SentinelHistoryStore({filePath});
    assert.equal((await store.load()).length,1);
  } finally { await rm(dir,{recursive:true,force:true}); }
});

test('SENTINEL save rejects invalid individual entries',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'baye-sentinel-invalid-entry-'));
  try {
    const store=new SentinelHistoryStore({filePath:join(dir,'history.json')});
    await assert.rejects(store.save([{checkedAt:'not-a-date',overallOk:true,results:[]}]),/invalid entry/);
    await assert.rejects(store.save([{checkedAt:'2026-11-22T10:00:00.000Z',overallOk:true,results:[{name:'bad',ok:'yes'}]}]),/invalid entry/);
  } finally { await rm(dir,{recursive:true,force:true}); }
});

test('SENTINEL store validates configured bounds',()=>{
  assert.throws(()=>new SentinelHistoryStore({maxEntries:0}),/positive safe integer/);
  assert.throws(()=>new SentinelHistoryStore({maxEntries:1.5}),/positive safe integer/);
});


test('SENTINEL rejects oversized persisted history before parsing',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'baye-sentinel-large-'));
  try{
    const filePath=join(dir,'history.json');
    const {writeFile}=await import('node:fs/promises');
    await writeFile(filePath,' '.repeat(2*1024*1024+1));
    const store=new SentinelHistoryStore({filePath});
    await assert.rejects(store.load(),/size limit/);
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('SENTINEL rejects unexpected persisted fields',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'baye-sentinel-fields-'));
  try{
    const store=new SentinelHistoryStore({filePath:join(dir,'history.json')});
    await assert.rejects(store.save([{checkedAt:'2026-11-22T10:00:00.000Z',overallOk:true,results:[{name:'backend',ok:true,extra:'unexpected'}]}]),/invalid entry/);
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('SENTINEL history persists monitor diagnostics and bounded result metadata',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'baye-sentinel-diagnostics-'));
  const filePath=join(dir,'history.json');
  try{
    const store=new SentinelHistoryStore({filePath,maxEntries:3});
    const report={
      checkedAt:'2026-11-22T10:00:00.000Z',
      overallOk:false,
      results:[{name:'backend-health',ok:false,status:503,latencyMs:125,error:'Non-success HTTP response'}],
      diagnostics:[{target:'backend-health',issue:'Non-success HTTP response',recommendation:'Inspect service logs and endpoint configuration.'}]
    };
    await store.save([report]);
    const restarted=new SentinelHistoryStore({filePath,maxEntries:3});
    assert.deepEqual(await restarted.load(),[report]);
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('SENTINEL rejects malformed or unexpected diagnostic fields',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'baye-sentinel-bad-diagnostics-'));
  try{
    const store=new SentinelHistoryStore({filePath:join(dir,'history.json')});
    const base={checkedAt:'2026-11-22T10:00:00.000Z',overallOk:false,results:[]};
    await assert.rejects(store.save([{...base,diagnostics:[{target:'backend',issue:'down',recommendation:'check',secret:'unexpected'}]}]),/invalid entry/);
    await assert.rejects(store.save([{...base,diagnostics:[{target:'backend',issue:'down',recommendation:7}]}]),/invalid entry/);
    await assert.rejects(store.save([{...base,results:[{name:'backend',ok:false,latencyMs:-1}]}]),/invalid entry/);
  }finally{await rm(dir,{recursive:true,force:true});}
});
