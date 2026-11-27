import test from 'node:test';
import assert from 'node:assert/strict';
import { generateCloudflareImage, getMediaProviderStatus } from '../server/ai/media-adapter.js';

const env={CLOUDFLARE_ACCOUNT_ID:'acct-test',CLOUDFLARE_API_TOKEN:'token-test'};
const response=(status,data)=>({ok:status>=200&&status<300,status,json:async()=>data});

test('image adapter rejects empty and oversized prompts',async()=>{
 await assert.rejects(()=>generateCloudflareImage({prompt:' ',env}),e=>e.code==='MEDIA_INVALID_PROMPT');
 await assert.rejects(()=>generateCloudflareImage({prompt:'x'.repeat(2049),env}),e=>e.code==='MEDIA_INVALID_PROMPT');
});
test('image adapter refuses missing provider credentials',async()=>{
 await assert.rejects(()=>generateCloudflareImage({prompt:'A landscape',env:{},fetchImpl:async()=>{throw Error('should not call')}}),e=>e.code==='MEDIA_NOT_CONFIGURED');
});
test('image adapter returns image data on successful provider response',async()=>{
 const result=await generateCloudflareImage({prompt:'A landscape',env,fetchImpl:async(_url,opts)=>{assert.equal(opts.method,'POST');assert.match(opts.headers.Authorization,/^Bearer /);return response(200,{success:true,result:{image:'YWJj'}})}});
 assert.equal(result.status,'COMPLETED');assert.equal(result.result.images[0].url,'data:image/jpeg;base64,YWJj');
});
test('image adapter handles empty provider image',async()=>{
 await assert.rejects(()=>generateCloudflareImage({prompt:'A landscape',env,fetchImpl:async()=>response(200,{success:true,result:{}})}),e=>e.code==='MEDIA_EMPTY_RESULT');
});
test('provider error diagnostics redact credentials',async()=>{
 await assert.rejects(()=>generateCloudflareImage({prompt:'A landscape',env,fetchImpl:async()=>response(401,{success:false,errors:[{code:100,message:'bad token-test acct-test'}]})}),e=>e.code==='MEDIA_PROVIDER_REJECTED'&&!e.providerErrors[0].message.includes('token-test')&&!e.providerErrors[0].message.includes('acct-test'));
});
test('provider status reports configured flags',()=>{
 const status=getMediaProviderStatus(env);assert.equal(status.image.configured,true);assert.equal(status.video.configured,false);
});
