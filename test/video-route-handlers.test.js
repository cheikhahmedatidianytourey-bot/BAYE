import test from 'node:test';
import assert from 'node:assert/strict';
import { createVideoSubmitHandler, createVideoStatusHandler } from '../server/ai/video-route-handlers.js';

function response(){
 const out={statusCode:200,body:null};
 return {out,status(code){out.statusCode=code;return this;},json(data){out.body=data;return this;}};
}
const req=(body={},query={})=>({body,query});

test('video submit rejects blank prompt',async()=>{const r=response();await createVideoSubmitHandler({getKey:()=> 'test-key'})(req({prompt:'  '}),r);assert.equal(r.out.statusCode,400);});
test('video submit rejects oversized prompt',async()=>{const r=response();await createVideoSubmitHandler({getKey:()=> 'test-key'})(req({prompt:'x'.repeat(2049)}),r);assert.equal(r.out.statusCode,400);});
test('video submit returns controlled configuration error',async()=>{const r=response();await createVideoSubmitHandler({getKey:()=>null})(req({prompt:'hello'}),r);assert.equal(r.out.statusCode,503);});
test('video submit forwards validated prompt and returns request id',async()=>{let seen;const r=response();await createVideoSubmitHandler({getKey:()=> 'test-key',validateImage:async()=>true,fetchImpl:async(url,opts)=>{seen={url,opts};return new Response(JSON.stringify({request_id:'abc_123'}),{status:200,headers:{'content-type':'application/json'}});}})(req({prompt:'  cinematic test  ',image_url:'https://example.com/image.jpg'}),r);assert.equal(r.out.statusCode,200);assert.equal(r.out.body.request_id,'abc_123');assert.ok(seen.url.includes('fal-ai/kling-video'));assert.equal(JSON.parse(seen.opts.body).prompt,'cinematic test');});
test('video submit rejects unsafe image URL before provider call',async()=>{let called=false;const r=response();await createVideoSubmitHandler({getKey:()=> 'test-key',validateImage:async()=>false,fetchImpl:async()=>{called=true;}})(req({prompt:'hello',image_url:'http://localhost/image'}),r);assert.equal(r.out.statusCode,400);assert.equal(called,false);});
test('video submit maps provider rejection',async()=>{const r=response();await createVideoSubmitHandler({getKey:()=> 'test-key',fetchImpl:async()=>new Response('{}',{status:401})})(req({prompt:'hello'}),r);assert.equal(r.out.statusCode,502);assert.equal(r.out.body.code,'PROVIDER_REJECTED');});
test('status rejects invalid query',async()=>{const r=response();await createVideoStatusHandler({getKey:()=> 'test-key'})(req({}, {type:'image',request_id:'bad'}),r);assert.equal(r.out.statusCode,400);});
test('status returns nonterminal provider state',async()=>{const r=response();await createVideoStatusHandler({getKey:()=> 'test-key',fetchImpl:async()=>new Response(JSON.stringify({status:'IN_PROGRESS'}),{status:200})})(req({}, {type:'video',request_id:'abc'}),r);assert.equal(r.out.statusCode,200);assert.equal(r.out.body.status,'IN_PROGRESS');});
test('status fetches completed result',async()=>{let calls=0;const r=response();await createVideoStatusHandler({getKey:()=> 'test-key',fetchImpl:async()=>{calls++;return new Response(JSON.stringify(calls===1?{status:'COMPLETED'}:{video:{url:'https://example.com/video.mp4'}}),{status:200});}})(req({}, {type:'video',request_id:'abc'}),r);assert.equal(r.out.statusCode,200);assert.equal(calls,2);assert.equal(r.out.body.status,'COMPLETED');assert.ok(r.out.body.result.video.url);});
test('status maps provider status failure',async()=>{const r=response();await createVideoStatusHandler({getKey:()=> 'test-key',fetchImpl:async()=>new Response('{}',{status:500})})(req({}, {type:'video',request_id:'abc'}),r);assert.equal(r.out.statusCode,502);});
