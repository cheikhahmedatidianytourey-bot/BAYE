import test from 'node:test';import assert from 'node:assert/strict';import {checkQuota,getPlan,publicPlanCatalog,consumeFreeQuota,quotaUsage} from '../server/subscription-policy.js';
test('free quota enforces text boundary',()=>{const id='text-test-'+Date.now();for(let i=0;i<30;i++)assert.equal(consumeFreeQuota(id,'text').allowed,true);assert.equal(consumeFreeQuota(id,'text').allowed,false);});
test('free quota enforces image boundary and excludes video',()=>{const id='media-test-'+Date.now();for(let i=0;i<3;i++)assert.equal(consumeFreeQuota(id,'image').allowed,true);assert.equal(consumeFreeQuota(id,'image').allowed,false);assert.equal(consumeFreeQuota(id,'video').reason,'feature_not_included');});
test('usage is separated by identity',()=>{const a='a-'+Date.now(),b='b-'+Date.now();consumeFreeQuota(a,'agent');assert.equal(quotaUsage(a).usage.agent.used,1);assert.equal(quotaUsage(b).usage.agent.used,0);});
test('invalid inputs fail closed',()=>{assert.equal(getPlan('invalid'),null);assert.equal(checkQuota('bad','text',0).allowed,false);assert.equal(consumeFreeQuota('', 'text').allowed,false);});
test('catalog has three tiers',()=>assert.equal(publicPlanCatalog().length,3));
