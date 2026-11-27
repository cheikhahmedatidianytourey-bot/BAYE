// Subscription quota policy. In-memory usage is a temporary enforcement layer, not durable billing/account state.
export const SUBSCRIPTION_PLANS = Object.freeze({
 free:Object.freeze({id:'free',name:'BAYE FREE',monthlyPriceMinor:0,currency:'XOF',quotas:Object.freeze({text:30,image:3,video:0,agent:3}),features:Object.freeze(['studio_basic','academy_basic'])}),
 pro:Object.freeze({id:'pro',name:'BAYE PRO',monthlyPriceMinor:null,currency:'XOF',quotas:Object.freeze({text:1000,image:100,video:20,agent:100}),features:Object.freeze(['studio','academy','image_generation','video_generation','agent'])}),
 ultra:Object.freeze({id:'ultra',name:'BAYE ULTRA',monthlyPriceMinor:null,currency:'XOF',quotas:Object.freeze({text:5000,image:500,video:100,agent:500}),features:Object.freeze(['studio','academy','image_generation','video_generation','agent','priority'])})
});
const validPlans=new Set(Object.keys(SUBSCRIPTION_PLANS)),validUsageTypes=new Set(['text','image','video','agent']);const usage=new Map();
export function getPlan(id='free'){return validPlans.has(id)?SUBSCRIPTION_PLANS[id]:null;}
export function checkQuota(id,type,used=0){const p=getPlan(id);if(!p||!validUsageTypes.has(type)||!Number.isSafeInteger(used)||used<0)return{allowed:false,reason:'invalid_input'};const limit=p.quotas[type];return{allowed:limit>0&&used<limit,plan:p.id,usageType:type,limit,used,remaining:Math.max(0,limit-used),reason:limit===0?'feature_not_included':used>=limit?'quota_exceeded':'within_quota'};}
export function publicPlanCatalog(){return Object.values(SUBSCRIPTION_PLANS).map(p=>({id:p.id,name:p.name,currency:p.currency,monthlyPriceMinor:p.monthlyPriceMinor,priceStatus:p.id==='free'?'fixed':'not_set',quotas:{...p.quotas},features:[...p.features]}));}
const period=()=>new Date().toISOString().slice(0,7);const key=(id,type)=>period()+'|'+id+'|'+type;
export function consumeFreeQuota(identity,type){if(typeof identity!=='string'||!identity||!validUsageTypes.has(type))return{allowed:false,reason:'invalid_input'};const k=key(identity,type),used=usage.get(k)||0,c=checkQuota('free',type,used);if(c.allowed){usage.set(k,used+1);return{...c,used:used+1,remaining:c.remaining-1};}return c;}
export function quotaUsage(identity){const result={period:period(),plan:'free',usage:{}};for(const type of validUsageTypes){const used=usage.get(key(identity,type))||0;result.usage[type]={used,limit:SUBSCRIPTION_PLANS.free.quotas[type],remaining:Math.max(0,SUBSCRIPTION_PLANS.free.quotas[type]-used)};}return result;}
