import test from 'node:test';
import assert from 'node:assert/strict';
import {submitVideo,checkVideoStatus} from '../server/ai/video-queue-adapter.js';
const response=(status,data,headers={})=>({ok:status>=200&&status<300,status,headers:{get:n=>headers[n]??null},json:async()=>data});
const key='test-key';

test('submission returns validated request ID and status URL',async()=>{
 const out=await submitVideo({prompt:'  cinematic scene  ',apiKey:key,fetchImpl:async(url,opts)=>{assert.equal(url,'https://queue.fal.run/fal-ai/kling-video/v2.1/standard/text-to-video');assert.equal(opts.method,'POST');assert.equal(JSON.parse(opts.body).prompt,'cinematic scene');return response(200,{request_id:'abc_123'});}});
 assert.equal(out.request_id,'abc_123');assert.match(out.status_url,/request_id=abc_123/);
});
test('submission rejects missing key and malformed IDs',async()=>{
 await assert.rejects(()=>submitVideo({prompt:'x',apiKey:''}),e=>e.code==='NOT_CONFIGURED');
 await assert.rejects(()=>submitVideo({prompt:'x',apiKey:key,fetchImpl:async()=>response(200,{request_id:'bad/id'})}),e=>e.code==='INVALID_REQUEST_ID');
});
test('submission validates prompt and upstream errors',async()=>{
 await assert.rejects(()=>submitVideo({prompt:' ',apiKey:key}),e=>e.code==='INVALID_PROMPT');
 await assert.rejects(()=>submitVideo({prompt:'x',apiKey:key,fetchImpl:async()=>response(429,{})}),e=>e.code==='PROVIDER_REJECTED'&&e.status===429);
});
test('status returns nonterminal states without requesting result',async()=>{
 for(const status of ['IN_PROGRESS','QUEUED','FAILED','CANCELLED','REJECTED']){
  let calls=0;const out=await checkVideoStatus({request_id:'abc',apiKey:key,fetchImpl:async()=>{calls++;return response(200,{status});}});
  assert.equal(out.status,status);assert.equal(calls,1);
 }
});
test('completed status fetches result',async()=>{
 let calls=0;const out=await checkVideoStatus({request_id:'abc',apiKey:key,fetchImpl:async()=>{calls++;return calls===1?response(200,{status:'COMPLETED'}):response(200,{video:{url:'https://example.test/video.mp4'}});}});
 assert.equal(calls,2);assert.equal(out.status,'COMPLETED');assert.equal(out.result.video.url,'https://example.test/video.mp4');
});
test('status validates request ID and handles provider errors',async()=>{
 await assert.rejects(()=>checkVideoStatus({request_id:'../x',apiKey:key}),e=>e.code==='INVALID_REQUEST_ID');
 await assert.rejects(()=>checkVideoStatus({request_id:'abc',apiKey:key,fetchImpl:async()=>response(503,{})}),e=>e.code==='STATUS_FAILED');
});
test('status rejects oversized payloads',async()=>{
 await assert.rejects(()=>checkVideoStatus({request_id:'abc',apiKey:key,fetchImpl:async()=>response(200,{status:'COMPLETED'},{'content-length':'2000000'})}),e=>e.code==='RESPONSE_TOO_LARGE');
});
