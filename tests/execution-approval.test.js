import test from 'node:test';
import assert from 'node:assert/strict';
import { buildExecutionGraph } from '../server/orchestration-kernel.js';
import { issueExecutionApproval, verifyAndConsumeExecutionApproval } from '../server/execution-approval.js';

const secret='test-execution-approval-secret-with-at-least-32-bytes';
const ownerId='account:user-123456';
const missionId='mission_12345678';
const graph=()=>buildExecutionGraph([
 {id:'research',role:'research',objective:'Analyze the requested project.'},
 {id:'quality',role:'quality',objective:'Review the analysis.',dependsOn:['research']}
],{maxTasks:5,maxDependenciesPerTask:4,maxTotalBudget:10,maxDepth:5});
function nonceStoreFixture({fail=false}={}){
 const used=new Set(),calls=[];
 return {calls,async consume(input){calls.push(input);if(fail)throw new Error('database unavailable');const key=input.keyId+':'+input.nonce;if(used.has(key))return false;used.add(key);return true;}};
}
function approve(overrides={}){return issueExecutionApproval({approved:true,ownerId,missionId,graph:graph(),secret,...overrides});}

test('issues a short-lived approval bound to the owner, mission, graph and specialist inference scope',()=>{
 const result=approve({now:1000,ttlSeconds:120});
 assert.equal(result.approval.status,'approved');
 assert.equal(result.approval.missionId,missionId);
 assert.equal(result.approval.taskCount,2);
 assert.deepEqual(result.approval.scopes,['specialist:text_inference','mission:checkpoint_write','mission:memory_write']);
 assert.equal(result.approval.oneTimeUse,true);
 assert.equal(result.approval.externalActions,false);
 assert.equal(result.approval.expiresAt,1120);
 assert.equal(typeof result.token,'string');
});

test('refuses to issue an approval unless the request explicitly approves',()=>{
 assert.throws(()=>issueExecutionApproval({approved:false,ownerId,missionId,graph:graph(),secret}),/approbation explicite/);
 assert.throws(()=>issueExecutionApproval({approved:'true',ownerId,missionId,graph:graph(),secret}),/approbation explicite/);
});

test('requires a secure secret and bounded approval lifetime',()=>{
 assert.throws(()=>approve({secret:'short'}),/32 octets/);
 assert.throws(()=>approve({ttlSeconds:30}),/Durée/);
 assert.throws(()=>approve({ttlSeconds:601}),/Durée/);
});

test('accepts an approval once and consumes its durable nonce before authorizing execution',async()=>{
 const issued=approve({now:1000,ttlSeconds:120}),store=nonceStoreFixture();
 const result=await verifyAndConsumeExecutionApproval({token:issued.token,ownerId,missionId,graph:graph(),secret,nonceStore:store,now:1050});
 assert.equal(result.authorized,true);
 assert.equal(result.ownerId,ownerId);
 assert.equal(result.missionId,missionId);
 assert.deepEqual(result.taskIds,['research','quality']);
 assert.equal(result.reviewMode,'deterministic');
 assert.deepEqual(result.scopes,['specialist:text_inference','mission:checkpoint_write','mission:memory_write']);
 assert.equal(result.oneTimeUse,true);
 assert.equal(store.calls.length,1);
 assert.equal(store.calls[0].keyId,'mission-execution-approval-v1');
 assert.equal(store.calls[0].expiresAt,1120000);
});

test('rejects replay of a previously consumed approval',async()=>{
 const issued=approve({now:1000}),store=nonceStoreFixture();
 await verifyAndConsumeExecutionApproval({token:issued.token,ownerId,missionId,graph:graph(),secret,nonceStore:store,now:1001});
 await assert.rejects(()=>verifyAndConsumeExecutionApproval({token:issued.token,ownerId,missionId,graph:graph(),secret,nonceStore:store,now:1002}),error=>error.code==='EXECUTION_APPROVAL_REPLAY');
});

test('rejects owner, mission, graph and task-scope substitution',async()=>{
 const issued=approve({now:1000}),store=nonceStoreFixture();
 await assert.rejects(()=>verifyAndConsumeExecutionApproval({token:issued.token,ownerId:'account:other-123456',missionId,graph:graph(),secret,nonceStore:store,now:1001}),/identité|mission|tâches/i);
 await assert.rejects(()=>verifyAndConsumeExecutionApproval({token:issued.token,ownerId,missionId:'mission_87654321',graph:graph(),secret,nonceStore:store,now:1001}),/identité|mission|tâches/i);
 const altered=buildExecutionGraph([{id:'research',role:'research',objective:'A different objective.'}],{maxTasks:5,maxDependenciesPerTask:4,maxTotalBudget:10,maxDepth:5});
 await assert.rejects(()=>verifyAndConsumeExecutionApproval({token:issued.token,ownerId,missionId,graph:altered,secret,nonceStore:store,now:1001}),/identité|mission|tâches/i);
 assert.equal(store.calls.length,0);
});

test('rejects tampered signatures and expired tokens before consuming a nonce',async()=>{
 const issued=approve({now:1000,ttlSeconds:60}),store=nonceStoreFixture();
 const tampered=issued.token.slice(0,-1)+(issued.token.endsWith('a')?'b':'a');
 await assert.rejects(()=>verifyAndConsumeExecutionApproval({token:tampered,ownerId,missionId,graph:graph(),secret,nonceStore:store,now:1001}),/Signature/);
 await assert.rejects(()=>verifyAndConsumeExecutionApproval({token:issued.token,ownerId,missionId,graph:graph(),secret,nonceStore:store,now:1060}),/expirée/);
 assert.equal(store.calls.length,0);
});

test('fails closed when the durable nonce store is missing or unavailable',async()=>{
 const issued=approve({now:1000});
 await assert.rejects(()=>verifyAndConsumeExecutionApproval({token:issued.token,ownerId,missionId,graph:graph(),secret,now:1001}),error=>error.code==='EXECUTION_APPROVAL_NOT_CONFIGURED');
 await assert.rejects(()=>verifyAndConsumeExecutionApproval({token:issued.token,ownerId,missionId,graph:graph(),secret,nonceStore:nonceStoreFixture({fail:true}),now:1001}),error=>error.code==='EXECUTION_APPROVAL_STORE_FAILED');
});

test('rejects malformed tokens and unvalidated graphs',async()=>{
 const store=nonceStoreFixture();
 await assert.rejects(()=>verifyAndConsumeExecutionApproval({token:'not.a.valid.token',ownerId,missionId,graph:graph(),secret,nonceStore:store,now:1001}));
 assert.throws(()=>issueExecutionApproval({approved:true,ownerId,missionId,graph:{status:'pending',mode:'plan_only',tasks:[]},secret}),/graphe de mission validé/);
 assert.equal(store.calls.length,0);
});

test('binds semantic review permission and mode to the exact approval',async()=>{
 const issued=approve({reviewMode:'semantic',now:1000}),store=nonceStoreFixture();
 assert.ok(issued.approval.scopes.includes('specialist:semantic_review'));
 await assert.rejects(()=>verifyAndConsumeExecutionApproval({token:issued.token,ownerId,missionId,graph:graph(),secret,nonceStore:store,now:1001}),/mode de vérification/i);
 assert.equal(store.calls.length,0);
 const result=await verifyAndConsumeExecutionApproval({token:issued.token,ownerId,missionId,graph:graph(),reviewMode:'semantic',secret,nonceStore:store,now:1001});
 assert.equal(result.reviewMode,'semantic');
 assert.ok(result.scopes.includes('specialist:semantic_review'));
});
