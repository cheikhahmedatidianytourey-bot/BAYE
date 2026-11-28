// G76: bounded deterministic task planner foundation for BAYE Engineering Factory.
// Planning only: no code execution, network access, or autonomous repository writes.
const MAX_TASKS=100, MAX_ID=80, MAX_TITLE=240, MAX_DEPENDENCIES=20;
export function planEngineeringTasks(input){
 if(!input||typeof input!=='object'||Array.isArray(input))return {status:'rejected',error:'Planner input object required.'};
 const tasks=input.tasks;
 if(!Array.isArray(tasks)||tasks.length<1||tasks.length>MAX_TASKS)return {status:'rejected',error:'tasks must contain 1–100 entries.'};
 const map=new Map();
 for(const [i,t] of tasks.entries()){
  if(!t||typeof t!=='object'||Array.isArray(t)||typeof t.id!=='string'||!t.id.trim()||t.id.length>MAX_ID||typeof t.title!=='string'||!t.title.trim()||t.title.length>MAX_TITLE||!Array.isArray(t.dependencies||[])||(t.dependencies||[]).length>MAX_DEPENDENCIES)return {status:'rejected',error:'Task '+i+' is invalid or exceeds limits.'};
  const id=t.id.trim();if(map.has(id))return {status:'rejected',error:'Duplicate task id: '+id};
  map.set(id,{id,title:t.title.trim(),dependencies:[...(t.dependencies||[])]});
 }
 for(const t of map.values())for(const dep of t.dependencies)if(typeof dep!=='string'||!map.has(dep)||dep===t.id)return {status:'rejected',error:'Unknown or self dependency in task '+t.id+'.'};
 // Kahn topological layering, emitting batches of mutually independent ready tasks.
 const pending=new Map([...map].map(([id,t])=>[id,new Set(t.dependencies)])),batches=[],done=new Set();
 while(pending.size){
  const ready=[...pending.keys()].filter(id=>[...pending.get(id)].every(d=>done.has(d))).sort();
  if(!ready.length)return {status:'rejected',error:'Dependency cycle detected.'};
  batches.push(ready.map(id=>map.get(id)));
  for(const id of ready){done.add(id);pending.delete(id);}
 }
 return {status:'planned',taskCount:map.size,batchCount:batches.length,batches};
}
export function getEngineeringPlannerStatus(){return {name:'BAYE Engineering Factory planner',milestone:'G76',version:'0.1.0',mode:'deterministic planning only',limits:{maxTasks:MAX_TASKS,maxDependenciesPerTask:MAX_DEPENDENCIES},capabilities:['bounded task validation','dependency validation','parallel-ready batch grouping','cycle detection'],executionEnabled:false,repositoryWritesEnabled:false};}
