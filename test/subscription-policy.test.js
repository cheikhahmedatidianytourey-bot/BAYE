import test from 'node:test';
import assert from 'node:assert/strict';
import { checkQuota, getPlan, consumeFreeQuota, quotaUsage } from '../server/subscription-policy.js';

test('free plan has image allowance and no video allowance',()=>{
 const free=getPlan('free');assert.equal(free.quotas.image,3);assert.equal(free.quotas.video,0);
 assert.equal(checkQuota('free','video',0).reason,'feature_not_included');
});
test('invalid plan/type/usage rejected',()=>{
 assert.equal(checkQuota('unknown','image',0).allowed,false);
 assert.equal(checkQuota('free','unknown',0).allowed,false);
 assert.equal(checkQuota('free','image',-1).allowed,false);
});
test('image free quota increments then blocks after three uses',()=>{
 const identity='g28-test-'+crypto.randomUUID();
 for(let i=1;i<=3;i++){const result=consumeFreeQuota(identity,'image');assert.equal(result.allowed,true);assert.equal(result.used,i);}
 const blocked=consumeFreeQuota(identity,'image');assert.equal(blocked.allowed,false);assert.equal(blocked.reason,'quota_exceeded');
 assert.equal(quotaUsage(identity).usage.image.used,3);
});
test('video quota refuses free usage',()=>{
 const identity='g28-video-'+crypto.randomUUID();const result=consumeFreeQuota(identity,'video');assert.equal(result.allowed,false);assert.equal(result.reason,'feature_not_included');
});
