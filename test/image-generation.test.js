import test from 'node:test';
import assert from 'node:assert/strict';
import { generateCloudflareImage } from '../server/ai/media-adapter.js';

const env={CLOUDFLARE_ACCOUNT_ID:'account-test',CLOUDFLARE_API_TOKEN:'token-test'};
const okImage=()=>new Response(JSON.stringify({success:true,result:{image:'aGVsbG8='}}),{status:200,headers:{'content-type':'application/json'}});
test('image generation rejects empty prompt',async()=>{await assert.rejects(()=>generateCloudflareImage({prompt:' ',env}),e=>e.code==='MEDIA_INVALID_PROMPT');});
test('image generation rejects prompt beyond limit',async()=>{await assert.rejects(()=>generateCloudflareImage({prompt:'x'.repeat(2049),env}),e=>e.code==='MEDIA_INVALID_PROMPT');});
test('image generation requires provider configuration',async()=>{await assert.rejects(()=>generateCloudflareImage({prompt:'image',env:{}}),e=>e.code==='MEDIA_NOT_CONFIGURED');});
test('image generation sends prompt and returns image data',async()=>{let seen;const result=await generateCloudflareImage({prompt:'test image',env,fetchImpl:async(url,opts)=>{seen={url,opts};return okImage();}});assert.equal(JSON.parse(seen.opts.body).prompt,'test image');assert.equal(result.status,'COMPLETED');assert.equal(result.result.images[0].url,'data:image/jpeg;base64,aGVsbG8=');});
test('image provider rejection mapped safely',async()=>{await assert.rejects(()=>generateCloudflareImage({prompt:'image',env,fetchImpl:async()=>new Response(JSON.stringify({success:false,errors:[{code:1001,message:'rejected'}]}),{status:401})}),e=>e.code==='MEDIA_PROVIDER_REJECTED'&&e.status===401);});
test('image quota rejection identified',async()=>{await assert.rejects(()=>generateCloudflareImage({prompt:'image',env,fetchImpl:async()=>new Response(JSON.stringify({success:false,errors:[{code:1002,message:'quota limit'}]}),{status:429})}),e=>e.code==='MEDIA_QUOTA_EXHAUSTED');});
test('image generation rejects empty result',async()=>{await assert.rejects(()=>generateCloudflareImage({prompt:'image',env,fetchImpl:async()=>new Response(JSON.stringify({success:true,result:{}}),{status:200})}),e=>e.code==='MEDIA_EMPTY_RESULT');});
test('image generation rejects oversized result',async()=>{await assert.rejects(()=>generateCloudflareImage({prompt:'image',env,fetchImpl:async()=>new Response(JSON.stringify({success:true,result:{image:'a'.repeat(10*1024*1024+1)}}),{status:200})}),e=>e.code==='MEDIA_RESULT_TOO_LARGE');});
test('image generation handles malformed provider response',async()=>{await assert.rejects(()=>generateCloudflareImage({prompt:'image',env,fetchImpl:async()=>new Response('not-json',{status:200})}),e=>e.code==='MEDIA_EMPTY_RESULT');});
