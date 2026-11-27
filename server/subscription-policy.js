// Subscription policy foundation: no billing or user identity integration yet.
export const SUBSCRIPTION_PLANS = Object.freeze({
  free: Object.freeze({ id:'free', name:'BAYE FREE', monthlyPriceMinor:0, currency:'XOF', quotas:Object.freeze({ text:30, image:3, video:0, agent:3 }), features:Object.freeze(['studio_basic','academy_basic']) }),
  pro: Object.freeze({ id:'pro', name:'BAYE PRO', monthlyPriceMinor:null, currency:'XOF', quotas:Object.freeze({ text:1000, image:100, video:20, agent:100 }), features:Object.freeze(['studio','academy','image_generation','video_generation','agent']) }),
  ultra: Object.freeze({ id:'ultra', name:'BAYE ULTRA', monthlyPriceMinor:null, currency:'XOF', quotas:Object.freeze({ text:5000, image:500, video:100, agent:500 }), features:Object.freeze(['studio','academy','image_generation','video_generation','agent','priority']) })
});
const validPlans = new Set(Object.keys(SUBSCRIPTION_PLANS));
const validUsageTypes = new Set(['text','image','video','agent']);
export function getPlan(planId='free') { return validPlans.has(planId) ? SUBSCRIPTION_PLANS[planId] : null; }
export function checkQuota(planId, usageType, used=0) {
  const plan=getPlan(planId);
  if(!plan||!validUsageTypes.has(usageType)||!Number.isSafeInteger(used)||used<0) return {allowed:false,reason:'invalid_input'};
  const limit=plan.quotas[usageType];
  return {allowed:limit>0&&used<limit,plan:plan.id,usageType,limit,used,remaining:Math.max(0,limit-used),reason:limit===0?'feature_not_included':used>=limit?'quota_exceeded':'within_quota'};
}
export function publicPlanCatalog(){return Object.values(SUBSCRIPTION_PLANS).map(p=>({id:p.id,name:p.name,currency:p.currency,monthlyPriceMinor:p.monthlyPriceMinor,priceStatus:p.id==='free'?'fixed':'not_set',quotas:{...p.quotas},features:[...p.features]}));}
