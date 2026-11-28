// G62: bounded compute-resource and worker dispatch planning only. No provisioning or execution.
const MAX_RESOURCES=50, MAX_BUDGET=1000;
const supported=new Set(['cpu','gpu','accelerator']);
const modes=new Set(['local','self-hosted','owned-hardware','declared-resource']);
function cleanResource(r){
 if(!r||typeof r!=='object'||Array.isArray(r))return null;
 if(typeof r.id!=='string'||!r.id.trim()||r.id.length>80)return null;
 if(!supported.has(r.kind)||!modes.has(r.mode))return null;
 const capacity=Number(r.capacity);
 if(!Number.isFinite(capacity)||capacity<1||capacity>100000)return null;
 return {id:r.id.trim(),kind:r.kind,mode:r.mode,capacity,declaredAvailable:r.declaredAvailable===true};
}
export function inspectComputeResources(input){
 if(!input||typeof input!=='object'||Array.isArray(input))return {status:'rejected',error:'Resource inventory object required.'};
 if(!Array.isArray(input.resources)||input.resources.length>MAX_RESOURCES)return {status:'rejected',error:'Provide a bounded resource list (maximum 50).'};
 const resources=input.resources.map(cleanResource);
 if(resources.some(r=>!r))return {status:'rejected',error:'Resource entries must include bounded id, supported kind/mode, and capacity.'};
 const ids=new Set(resources.map(r=>r.id));if(ids.size!==resources.length)return {status:'rejected',error:'Resource identifiers must be unique.'};
 return {status:'inspected',resources,availableCount:resources.filter(r=>r.declaredAvailable).length,dispatchEnabled:false,provisioningEnabled:false};
}
export function planComputeDispatch(input){
 if(!input||typeof input!=='object'||Array.isArray(input))return {status:'rejected',error:'Dispatch plan object required.'};
 const inventory=inspectComputeResources({resources:input.resources});
 if(inventory.status==='rejected')return inventory;
 const kind=input.requiredKind;if(!supported.has(kind))return {status:'rejected',error:'Supported resource kind required.'};
 const budget=Number(input.maxResourceUnits);
 if(!Number.isFinite(budget)||budget<1||budget>MAX_BUDGET)return {status:'rejected',error:'Resource budget must be 1–1000 units.'};
 const required=Number(input.requiredCapacity);
 if(!Number.isFinite(required)||required<1||required>100000)return {status:'rejected',error:'Required capacity must be bounded (1–100000).'};
 const candidate=inventory.resources.filter(r=>r.kind===kind&&r.declaredAvailable&&r.capacity>=required&&r.capacity<=budget).sort((a,b)=>a.capacity-b.capacity)[0];
 return {status:candidate?'planned':'unavailable',plan:candidate?{resourceId:candidate.id,kind,mode:candidate.mode,capacity:candidate.capacity,requiredCapacity:required,resourceBudget:budget}:null,alternatives:inventory.resources.filter(r=>r.kind===kind&&!r.declaredAvailable).map(r=>({id:r.id,mode:r.mode,capacity:r.capacity,availability:'not declared'})),dispatchEnabled:false,provisioningEnabled:false,executionEnabled:false,trainingStarted:false,scope:'planning only; no worker dispatch, provisioning, external provider request, or execution'};
}
export function getComputeWorkerStatus(){return {stage:'planning-foundation',inventoryLimit:MAX_RESOURCES,resourceKinds:[...supported],resourceModes:[...modes],resourceBudgetLimit:MAX_BUDGET,workerDispatchEnabled:false,provisioningEnabled:false,executionEnabled:false,trainingStarted:false,scope:'declared resource inventory and bounded dispatch plans only; no compute or worker execution'};}
