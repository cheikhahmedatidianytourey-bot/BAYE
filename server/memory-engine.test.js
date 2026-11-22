import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {MemoryEngine} from './memory-engine.js';

test('parallel additions are serialized and retained',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'baye-memory-'));
  try{
    const engine=new MemoryEngine({filePath:path.join(dir,'memory.json'),maxEntries:100});
    const results=await Promise.all(Array.from({length:40},(_,i)=>engine.add({text:'entry '+i,tags:['test']})));
    const stored=await engine.readAll();
    assert.equal(results.length,40);assert.equal(stored.length,40);
    assert.equal(new Set(stored.map(x=>x.id)).size,40);
    assert.equal((await engine.search('entry')).length,40);
    const stat=await fs.stat(path.join(dir,'memory.json'));
    assert.equal(stat.mode&0o777,0o600);
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('concurrent remove and clear do not race writes',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'baye-memory-'));
  try{
    const engine=new MemoryEngine({filePath:path.join(dir,'memory.json')});
    const items=await Promise.all(Array.from({length:10},(_,i)=>engine.add({text:'item '+i}));
    await Promise.all(items.slice(0,5).map(i=>engine.remove(i.id)));
    assert.equal((await engine.readAll()).length,5);
    await Promise.all([engine.clear(),engine.add({text:'after clear'})]);
    assert.equal((await engine.readAll()).length,1);
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('bounds and rejects invalid memory inputs',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'baye-memory-'));
  try{
    const engine=new MemoryEngine({filePath:path.join(dir,'memory.json'),maxEntries:3});
    await Promise.all(Array.from({length:5},(_,i)=>engine.add({text:'n'+i}));
    assert.equal((await engine.readAll()).length,3);
    await assert.rejects(()=>engine.add({text:''}));
    await assert.rejects(()=>engine.add({text:'ok',tags:Array(21).fill('tag')}));
    await assert.rejects(()=>engine.add({text:'ok',tags:[null]}));
    await assert.rejects(()=>engine.add({text:'ok',tags:[' '.repeat(60)]}));
    const item=await engine.add({text:' dedup ',tags:[' a ','a','',' b ']});
    assert.equal(item.text,'dedup');assert.deepEqual(item.tags,['a','b']);
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('constructor rejects unsafe bounds and malformed files are filtered',async()=>{
  assert.throws(()=>new MemoryEngine({maxEntries:0}),/maxEntries/);
  assert.throws(()=>new MemoryEngine({maxEntries:10001}),/maxEntries/);
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'baye-memory-'));
  try{
    const file=path.join(dir,'memory.json');
    await fs.writeFile(file,JSON.stringify([{id:'1',text:'safe',tags:[]},{id:'bad'},{id:'2',text:'unsafe tags',tags:[4]}]));
    const engine=new MemoryEngine({filePath:file});
    assert.deepEqual(await engine.search('safe'),[{id:'1',text:'safe',tags:[]}]);
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});
