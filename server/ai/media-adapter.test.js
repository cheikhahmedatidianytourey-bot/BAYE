import test from 'node:test';
import assert from 'node:assert/strict';
import {generateCloudflareImage,getMediaProviderStatus} from './media-adapter.js';

test('image provider is configured only when both secrets exist',()=>{
  assert.equal(getMediaProviderStatus({}).image.configured,false);
  assert.equal(getMediaProviderStatus({CLOUDFLARE_ACCOUNT_ID:'id'}).image.configured,false);
  assert.equal(getMediaProviderStatus({CLOUDFLARE_ACCOUNT_ID:'id',CLOUDFLARE_API_TOKEN:'token'}).image.configured,true);
});
test('image generation returns a browser-displayable data URI',async()=>{
  let request;
  const result=await generateCloudflareImage({prompt:'A mountain at sunrise',env:{CLOUDFLARE_ACCOUNT_ID:'account',CLOUDFLARE_API_TOKEN:'secret'},fetchImpl:async(url,options)=>{request={url,options};return {ok:true,status:200,json:async()=>({success:true,result:{image:'YWJj'}})};}});
  assert.match(request.url,/flux-1-schnell$/);
  assert.equal(request.options.headers.Authorization,'Bearer secret');
  assert.equal(result.status,'COMPLETED');
  assert.equal(result.result.images[0].url,'data:image/jpeg;base64,YWJj');
});
test('missing image credentials fail closed',async()=>{
  await assert.rejects(()=>generateCloudflareImage({prompt:'test',env:{},fetchImpl:async()=>{throw new Error('must not call');}}),{code:'MEDIA_NOT_CONFIGURED'});
});
test('provider quota failures are surfaced without leaking provider details',async()=>{
  await assert.rejects(()=>generateCloudflareImage({prompt:'test',env:{CLOUDFLARE_ACCOUNT_ID:'id',CLOUDFLARE_API_TOKEN:'secret'},fetchImpl:async()=>({ok:false,status:429,json:async()=>({errors:[{message:'private details'}]})})}),{code:'MEDIA_QUOTA_EXHAUSTED'});
});
test('provider diagnostics redact account identifiers and API tokens',async()=>{
  await assert.rejects(()=>generateCloudflareImage({
    prompt:'test',
    env:{CLOUDFLARE_ACCOUNT_ID:'account-private',CLOUDFLARE_API_TOKEN:'token-private'},
    fetchImpl:async()=>({ok:false,status:401,json:async()=>({errors:[{code:1000,message:'token-private account-private rejected'}]})})
  }),error=>{
    assert.equal(error.code,'MEDIA_PROVIDER_REJECTED');
    assert.equal(JSON.stringify(error.providerErrors).includes('token-private'),false);
    assert.equal(JSON.stringify(error.providerErrors).includes('account-private'),false);
    assert.match(JSON.stringify(error.providerErrors),/REDACTED/);
    return true;
  });
});
test('an empty provider image is rejected',async()=>{
  await assert.rejects(()=>generateCloudflareImage({
    prompt:'test',
    env:{CLOUDFLARE_ACCOUNT_ID:'id',CLOUDFLARE_API_TOKEN:'token'},
    fetchImpl:async()=>({ok:true,status:200,json:async()=>({success:true,result:{}})})
  }),{code:'MEDIA_EMPTY_RESULT'});
});
test('image prompts above the model limit are rejected before network access',async()=>{
  await assert.rejects(()=>generateCloudflareImage({prompt:'x'.repeat(2049),env:{CLOUDFLARE_ACCOUNT_ID:'id',CLOUDFLARE_API_TOKEN:'token'},fetchImpl:async()=>{throw new Error('must not call');}}),{code:'MEDIA_INVALID_PROMPT'});
});
