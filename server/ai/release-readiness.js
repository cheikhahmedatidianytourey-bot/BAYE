// Release readiness report: transparent inventory; never claims unavailable capabilities are live.
const items=[
{id:'core',label:'BAYE CORE',stage:'existing-foundation',testFocus:'conversation, task routing, fallback and reliability'},
{id:'agent-tools',label:'Agent & safe tools',stage:'limited',testFocus:'allowlist boundaries, task orchestration and failure handling'},
{id:'app-builder',label:'Application builder',stage:'mvp-foundation',testFocus:'project generation, integrity checks and repeatability'},
{id:'data-engine',label:'DATA ENGINE',stage:'metadata-foundation',testFocus:'validation, intake, privacy declarations, lineage'},
{id:'training-engine',label:'TRAINING ENGINE',stage:'planning-foundation',testFocus:'configuration, readiness, run lifecycle and persistence'},
{id:'vision',label:'VISION',stage:'provider-integration-dependent',testFocus:'image provider status and real generation/analysis availability'},
{id:'motion',label:'MOTION',stage:'provider-integration-dependent',testFocus:'video availability, submission, status and output'},
{id:'audio',label:'AUDIO',stage:'not-verified',testFocus:'real audio capabilities and end-to-end validation'},
{id:'memory',label:'Memory',stage:'implementation-dependent',testFocus:'persistence, recall, edit, delete and privacy'},
{id:'security',label:'Security',stage:'continuous-validation',testFocus:'authorization, rate limits, isolation, abuse and fail-closed behavior'},
{id:'platform-api',label:'API & platform',stage:'existing-foundation',testFocus:'routes, integration, deployment health and error handling'}
];
export function buildReleaseReadinessReport(signals={}){
 const checklist=items.map(x=>({...x,validatedByUser:false,releaseBlocker:true}));
 const blockers=checklist.filter(x=>x.stage==='not-verified'||x.stage==='provider-integration-dependent'||x.stage==='implementation-dependent'||x.stage==='limited'||x.stage.endsWith('foundation')||x.stage==='continuous-validation').map(x=>x.id);
 return {report:'BAYE first-release readiness',generatedAt:new Date().toISOString(),mode:'inventory-only',releaseDeclared:false,releaseReady:false,executionEnabled:false,validatedFeatureCount:0,featureCount:checklist.length,checklist,signalsPresent:Object.keys(signals).filter(k=>signals[k]!==undefined),blockerFeatureIds:blockers,testingProtocol:['Run automated tests for each change','Test feature manually in real interface when available','Record evidence and defect reports','Fix and rerun both automated and manual checks'],disclaimer:'This inventory is a planning aid, not a live test, certification, production readiness claim, or proof that each capability is implemented. Feature stage labels require independent validation.'};
}
