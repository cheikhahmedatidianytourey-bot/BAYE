// BAYE orchestration planning primitives: strict, provider-neutral and side-effect free.
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export function validatePlan(plan,{maxTasks=200}={}) {
 if(!object(plan)||!Array.isArray(plan.tasks))throw new TypeError('Plan must contain a tasks array.');
 if(plan.tasks.length>maxTasks)throw new RangeError('Plan exceeds configured task bound.');
 const ids=new Set();
 for(const task of plan.tasks){
  if(!object(task)||typeof task.id!=='string'||!task.id.trim()||ids.has(task.id))throw new TypeError('Task IDs must be unique non-empty strings.');
  ids.add(task.id);
  if(typeof task.description!=='string'||!task.description.trim())throw new TypeError('Task description is required.');
  if(typeof task.capability!=='string'||!task.capability.trim())throw new TypeError('Task capability is required.');
  if(!Array.isArray(task.dependencies)||task.dependencies.some(d=>typeof d!=='string')||new Set(task.dependencies).size!==task.dependencies.length)throw new TypeError('Invalid task dependencies.');
  if(task.dependencies.includes(task.id))throw new Error('Task cannot depend on itself.');
 }
 for(const task of plan.tasks)for(const dep of task.dependencies)if(!ids.has(dep))throw new Error('Plan references an unknown dependency.');
 const byId=new Map(plan.tasks.map(t=>[t.id,t])), visiting=new Set(),visited=new Set();
 function visit(id){if(visiting.has(id))throw new Error('Plan contains a dependency cycle.');if(visited.has(id))return;visiting.add(id);for(const d of byId.get(id).dependencies)visit(d);visiting.delete(id);visited.add(id);}
 for(const id of ids)visit(id);
 return {valid:true,taskCount:plan.tasks.length};
}
export function topologicalOrder(plan) {
 validatePlan(plan);
 const remaining=new Map(plan.tasks.map(t=>[t.id,t])),done=new Set(),ordered=[];
 while(remaining.size){const ready=[...remaining.values()].filter(t=>t.dependencies.every(d=>done.has(d))).sort((a,b)=>(a.order??0)-(b.order??0)||a.id.localeCompare(b.id));if(!ready.length)throw new Error('Unable to resolve plan ordering.');const task=ready[0];remaining.delete(task.id);done.add(task.id);ordered.push(task);}
 return ordered;
}
