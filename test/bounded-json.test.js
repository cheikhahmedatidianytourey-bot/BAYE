import test from 'node:test';
import assert from 'node:assert/strict';
import { readJsonLimited } from '../server/ai/bounded-json.js';

const mock=(data,contentLength)=>({headers:{get:n=>n==='content-length'?contentLength:null},body:null,json:async()=>data});
test('reads bounded JSON fallback response',async()=>assert.deepEqual(await readJsonLimited(mock({ok:true},'10'),100),{ok:true}));
test('rejects declared oversized content',async()=>await assert.rejects(()=>readJsonLimited(mock({ok:true},'500'),100),/size limit/i));
test('rejects invalid byte limit',async()=>await assert.rejects(()=>readJsonLimited(mock({},null),0),/maxBytes/i));
test('rejects serialized fallback exceeding size',async()=>await assert.rejects(()=>readJsonLimited(mock({data:'x'.repeat(200)},null),50),/size limit/i));
