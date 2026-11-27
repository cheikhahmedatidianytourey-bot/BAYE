import test from 'node:test';
import assert from 'node:assert/strict';
import { generateCloudflareImage, getMediaProviderStatus } from '../server/ai/media-adapter.js';

const env={CLOUDFLARE_ACCOUNT_ID:'acct-test',CLOUDFLARE_API_TOKEN:'token-test'};
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});

test('media provider status reflects configuration without exposing secrets',()=>{
 const status=getMediaProviderStatus(env);
 assert.equal(status.image.configured,true);
 assert.equal(status.video.configured,false);
 assert.equal(JSON.stringify(status).includes('token-test'),false);
});

test('image prompt validation rejects blank and oversized prompts before fetch',async()=>{
 let calls=0;const fetchImpl=async()=>{calls++;throw new Error('unexpected');};
 await assert.rejects(()=>generateCloudflareImage({prompt:'  ',env,fetchImpl}),e=>e.code==='MEDIA_INVALID_PROMPT');
 await assert.rejects(()=>generateCloudflareImage({prompt:'x'.repeat(2049),env,fetchImpl}),e=>e.code==='MEDIA_INVALID_PROMPT');
 assert.equal(calls,0);
});

test('image generation returns a data URL and sends bounded request parameters',async()=>{
 let captured;
 const fetchImpl=async(url,opts)=>{captured={url,opts};return json({success:true,result:{image:'aGVsbG8='}});};
 const result=await generateCloudflareImage({prompt:'A test landscape',env,fetchImpl});
 assert.equal(result.status,'COMPLETED');
 assert.equal(result.provider,'cloudflare-workers-ai');
 assert.equal(result.result.images[0].url,'data:image/jpeg;base64,aGVsbG8=');
 assert.equal(captured.opts.method,'POST');
 assert.deepEqual(JSON.parse(captured.opts.body),{prompt:'A test landscape',steps:4});
 assert.equal(captured.opts.headers.Authorization,'Bearer token-test');
});

test('image generation refuses unconfigured provider',async()=>{
 await assert.rejects(()=>generateCloudflareImage({prompt:'test',env:{},fetchImpl:async()=>{throw new Error('unexpected');}}),e=>e.code==='MEDIA_NOT_CONFIGURED');
});

test('provider failure redacts credentials from diagnostics',async()=>{
 const fetchImpl=async()=>json({success:false,errors:[{code:1001,message:'token-test acct-test bad request'}]},401);
 await assert.rejects(()=>generateCloudflareImage({prompt:'test',env,fetchImpl}),e=>{
   assert.equal(e.code,'MEDIA_PROVIDER_REJECTED');
   assert.equal(e.status,401);
   assert.equal(JSON.stringify(e.providerErrors).includes('token-test'),false);
   assert.equal(JSON.stringify(e.providerErrors).includes('acct-test'),false);
   return true;
 });
});

test('quota response is classified and no paid fallback is attempted',async()=>{
 const fetchImpl=async()=>json({success:false,errors:[{code:429,message:'daily limit exceeded'}]},429);
 await assert.rejects(()=>generateCloudflareImage({prompt:'test',env,fetchImpl}),e=>e.code==='MEDIA_QUOTA_EXHAUSTED');
});

test('image generation rejects missing image and oversized result',async()=>{
 await assert.rejects(()=>generateCloudflareImage({prompt:'test',env,fetchImpl:async()=>json({success:true,result:{}})}),e=>e.code==='MEDIA_EMPTY_RESULT');
 await assert.rejects(()=>generateCloudflareImage({prompt:'test',env,fetchImpl:async()=>json({success:true,result:{image:'x'.repeat(10*1024*1024+1)}})}),e=>e.code==='MEDIA_RESULT_TOO_LARGE');
});
