// BAYE orchestration planning primitives: strict, provider-neutral and side-effect free.
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export function validatePlan(plan, {maxTasks = 200} = {}) {
 if (!object(plan) || !Array.isArray(plan.tasks)) throw new TypeError('Plan must contain a tasks array.');
 if (!Number.isSafeInteger(maxTasks) || maxTasks < 1) throw new TypeError('maxTasks must be a positive integer.');
 if (plan.tasks.length > maxTasks) throw new RangeError('Plan exceeds configured task bound.');
 const ids = new Set();
 for (const task of plan.tasks) {
  if (!object(task) || typeof task.id !== 'string' || !task.id.trim() || task.id !== task.id.trim() || ids.has(task.id))
   throw new TypeError('Task IDs must be unique non-empty trimmed strings.');
  ids.add(task.id);
  if (typeof task.description !== 'string' || !task.description.trim()) throw new TypeError('Task description is required.');
  if (typeof task.capability !== 'string' || !task.capability.trim()) throw new TypeError('Task capability is required.');
  if (!Array.isArray(task.dependencies) || task.dependencies.some(d => typeof d !== 'string') || new Set(task.dependencies).size !== task.dependencies.length)
   throw new TypeError('Invalid task dependencies.');
  if (task.dependencies.includes(task.id)) throw new Error('Task cannot depend on itself.');
 }
 for (const task of plan.tasks) for (const dep of task.dependencies) if (!ids.has(dep)) throw new Error('Plan references an unknown dependency.');
 // Iterative traversal avoids call-stack exhaustion on adversarially deep graphs.
 const byId = new Map(plan.tasks.map(t => [t.id, t]));
 const indegree = new Map(plan.tasks.map(t => [t.id, t.dependencies.length]));
 const dependents = new Map(plan.tasks.map(t => [t.id, []]));
 for (const t of plan.tasks) for (const d of t.dependencies) dependents.get(d).push(t.id);
 const queue = [...plan.tasks.filter(t => indegree.get(t.id) === 0).map(t => t.id)];
 let processed = 0;
 while (queue.length) {
  const id = queue.pop(); processed++;
  for (const next of dependents.get(id)) { indegree.set(next, indegree.get(next)-1); if (indegree.get(next)===0) queue.push(next); }
 }
 if (processed !== plan.tasks.length) throw new Error('Plan contains a dependency cycle.');
 return {valid:true, taskCount:plan.tasks.length};
}

export function topologicalOrder(plan, options = {}) {
 validatePlan(plan, options);
 const indegree = new Map(plan.tasks.map(t => [t.id, t.dependencies.length]));
 const dependents = new Map(plan.tasks.map(t => [t.id, []]));
 for (const t of plan.tasks) for (const d of t.dependencies) dependents.get(d).push(t.id);
 const remaining = new Map(plan.tasks.map(t => [t.id, t]));
 const ordered = [];
 while (remaining.size) {
  const ready = [...remaining.values()].filter(t => indegree.get(t.id)===0)
   .sort((a,b)=>(a.order??0)-(b.order??0)||a.id.localeCompare(b.id));
  if (!ready.length) throw new Error('Unable to resolve plan ordering.');
  const task=ready[0]; remaining.delete(task.id); ordered.push(task);
  for (const next of dependents.get(task.id)) indegree.set(next, indegree.get(next)-1);
 }
 return ordered;
}
