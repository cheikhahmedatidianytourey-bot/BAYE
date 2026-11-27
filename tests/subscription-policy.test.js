import test from 'node:test';
import assert from 'node:assert/strict';
import {checkQuota,getPlan,publicPlanCatalog} from '../server/subscription-policy.js';
test('free plan image quota has clear boundary',()=>{assert.equal(checkQuota('free','image',2).allowed,true);assert.equal(checkQuota('free','image',3).allowed,false);});
test('zero quota is denied and reports feature_not_included',()=>{assert.equal(checkQuota('free','video',0).reason,'feature_not_included');});
test('unknown plans and invalid usage fail closed',()=>{assert.equal(getPlan('unknown'),null);assert.equal(checkQuota('unknown','text',0).allowed,false);assert.equal(checkQuota('free','text',-1).allowed,false);});
test('quota check is non-mutating and reports remaining usage',()=>{assert.deepEqual(checkQuota('free','text',10),{allowed:true,plan:'free',usageType:'text',limit:30,used:10,remaining:20,reason:'within_quota'});});
test('catalog omits private implementation details and includes price status',()=>{const c=publicPlanCatalog();assert.equal(c.length,3);assert.equal(c[0].priceStatus,'fixed');assert.equal(c[1].priceStatus,'not_set');});
