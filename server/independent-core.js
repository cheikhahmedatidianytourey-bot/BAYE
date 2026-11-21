// BAYE Independent Intelligence Core (BII) — orchestration scaffold v0.1.
// Provider-free deterministic planning. This is NOT a trained foundation model.
const domains = [
  {id:'engineering',keywords:['code','coding','program','bug','dévelop','software','api','app','application']},
  {id:'creative',keywords:['image','photo','video','design','illustr','cré','art']},
  {id:'research',keywords:['research','recherche','analyse','compare','étude','explain','explique']},
  {id:'planning',keywords:['plan','organis','strategy','stratég','project','projet','build','constru']},
  {id:'general',keywords:[]}
];
export function classifyMission(text){
 const t=String(text||'').toLowerCase();
 for(const d of domains){if(d.keywords.some(k=>t.includes(k)))return d.id;}
 return 'general';
}
export function buildMissionPlan(text){
 if(typeof text!=='string'||!text.trim())throw new Error('Mission required');
 const mission=text.trim().slice(0,4000),domain=classifyMission(mission);
 const steps=[
  {id:1,action:'Clarifier l’objectif et les contraintes',status:'ready'},
  {id:2,action:'Décomposer la mission en sous-tâches',status:'ready'},
  {id:3,action:'Choisir les capacités et outils disponibles',status:'needs_execution'},
  {id:4,action:'Exécuter et vérifier les résultats',status:'needs_execution'},
  {id:5,action:'Présenter les résultats et limites',status:'ready'}
 ];
 return {core:'BAYE Independent Intelligence Core',version:'0.1.0',mode:'provider-free planning scaffold',domain,mission,steps,executionAvailable:false,disclaimer:'Planification déterministe; ce noyau ne réalise pas à lui seul un raisonnement génératif avancé ni l’exécution des étapes.'};
}
export function getIndependentCoreStatus(){
 return {name:'BAYE Independent Intelligence Core',version:'0.1.0',status:'foundation',providerIndependent:true,trainedFoundationModel:false,capabilities:['mission classification','deterministic task planning','modular orchestration foundation'],nextMilestones:['model integration under BAYE control','persistent memory with consent and safeguards','evaluation and learning pipeline','tool execution with verification']};
}
