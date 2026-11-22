// Bounded orchestration kernel: validates and schedules task graphs without executing agents or tools.
const ROLE_CAPABILITIES = Object.freeze({
  coordinator: ['decompose','synthesize'],
  research: ['analyze_input','prepare_research_plan'],
  engineering: ['analyze_code','prepare_change_plan'],
  data: ['analyze_data','prepare_analysis_plan'],
  creative: ['analyze_brief','prepare_content_plan'],
  quality: ['inspect_artifact','prepare_test_plan'],
  security: ['inspect_risk','prepare_security_review']
});
const DEFAULT_LIMITS = Object.freeze({maxTasks:12,maxDependenciesPerTask:6,maxTotalBudget:100,maxDepth:8});
function fail(message){throw new Error(message);}
export function getOrchestrationRoles(){
 return Object.entries(ROLE_CAPABILITIES).map(([id,capabilities])=>({id,capabilities:[...capabilities]}));
}
export function buildExecutionGraph(tasks,limits={}){
 const policy={...DEFAULT_LIMITS,...limits};
 if(!Array.isArray(tasks)||tasks.length<1||tasks.length>policy.maxTasks)fail('Le graphe doit contenir de 1 à '+policy.maxTasks+' tâches.');
 const byId=new Map();
 let totalBudget=0;
 for(const task of tasks){
  if(!task||typeof task!=='object'||Array.isArray(task))fail('Tâche invalide.');
  if(typeof task.id!=='string'||!/^[a-zA-Z0-9_-]{1,64}$/.test(task.id))fail('Identifiant de tâche invalide.');
  if(byId.has(task.id))fail('Identifiant de tâche dupliqué: '+task.id);
  if(typeof task.role!=='string'||!Object.hasOwn(ROLE_CAPABILITIES,task.role))fail('Rôle non autorisé pour '+task.id+'.');
  if(typeof task.objective!=='string'||!task.objective.trim()||task.objective.length>2000)fail('Objectif invalide pour '+task.id+'.');
  const dependsOn=task.dependsOn??[];
  if(!Array.isArray(dependsOn)||dependsOn.length>policy.maxDependenciesPerTask||dependsOn.some(x=>typeof x!=='string'))fail('Dépendances invalides pour '+task.id+'.');
  if(new Set(dependsOn).size!==dependsOn.length||dependsOn.includes(task.id))fail('Dépendances dupliquées ou circulaires pour '+task.id+'.');
  const budget=task.budget??1;
  if(!Number.isFinite(budget)||budget<=0)fail('Budget invalide pour '+task.id+'.');
  totalBudget+=budget;
  byId.set(task.id,{id:task.id,role:task.role,objective:task.objective.trim(),dependsOn:[...dependsOn],budget,capabilities:[...ROLE_CAPABILITIES[task.role]]});
 }
 if(totalBudget>policy.maxTotalBudget)fail('Budget total du graphe dépassé.');
 for(const task of byId.values())for(const dep of task.dependsOn)if(!byId.has(dep))fail('Dépendance inconnue '+dep+' pour '+task.id+'.');
 const indegree=new Map([...byId.keys()].map(id=>[id,byId.get(id).dependsOn.length]));
 const dependents=new Map([...byId.keys()].map(id=>[id,[]]));
 for(const task of byId.values())for(const dep of task.dependsOn)dependents.get(dep).push(task.id);
 const ready=[...byId.keys()].filter(id=>indegree.get(id)===0);
 const ordered=[];
 while(ready.length){
  const id=ready.shift();ordered.push(byId.get(id));
  for(const child of dependents.get(id)){
   indegree.set(child,indegree.get(child)-1);
   if(indegree.get(child)===0)ready.push(child);
  }
 }
 if(ordered.length!==byId.size)fail('Cycle détecté dans le graphe de tâches.');
 const depth=new Map();
 for(const task of ordered){
  const d=task.dependsOn.length?1+Math.max(...task.dependsOn.map(id=>depth.get(id))):1;
  depth.set(task.id,d);
  if(d>policy.maxDepth)fail('Profondeur maximale du graphe dépassée.');
 }
 return {
  engine:'BAYE Orchestration Kernel',
  version:1,
  status:'validated',
  mode:'plan_only',
  tasks:ordered.map((task,index)=>({...task,sequence:index+1,status:'pending'})),
  limits:{...policy},
  accounting:{taskCount:ordered.length,totalBudget},
  execution:{started:false,toolsInvoked:0,externalActions:false,requiresPolicyAuthorization:true}
 };
}
