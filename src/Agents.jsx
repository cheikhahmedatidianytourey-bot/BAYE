import React,{useState} from 'react';

const API='https://baye-ai-gateway.onrender.com';
const ROLE_OPTIONS=[
 {id:'research',label:'Recherche & analyse',detail:'Structure les informations, hypothèses et questions ouvertes.'},
 {id:'engineering',label:'Ingénierie',detail:'Analyse l’architecture, les étapes techniques et les tests.'},
 {id:'data',label:'Données',detail:'Examine les chiffres, méthodes et hypothèses.'},
 {id:'creative',label:'Créativité',detail:'Développe des pistes originales et adaptées au brief.'},
 {id:'security',label:'Sécurité',detail:'Identifie les risques et les mesures de protection.'},
 {id:'quality',label:'Qualité',detail:'Relit les résultats, recherche les lacunes et contradictions.'},
 {id:'coordinator',label:'Coordination',detail:'Rassemble les conclusions des autres spécialistes.'}
];
const ROLE_TASK={
 research:'Analyse la mission. Distingue les éléments établis, les hypothèses, les incertitudes et les questions à approfondir.',
 engineering:'Propose une approche technique concrète, une architecture adaptée, les étapes de réalisation et les tests nécessaires.',
 data:'Identifie les données nécessaires, les méthodes d’analyse, les hypothèses et les limites quantitatives.',
 creative:'Propose des solutions originales, différenciantes et réalistes, alignées sur l’objectif et les contraintes.',
 security:'Évalue les risques, les abus possibles, les frontières de confiance et les mesures défensives prioritaires.',
 quality:'Évalue de façon critique les résultats précédents. Repère les contradictions, oublis, risques et points à vérifier.',
 coordinator:'Synthétise les contributions précédentes en une réponse cohérente, hiérarchisée et directement exploitable. Signale les points qui restent à vérifier.'
};
const ORDER=ROLE_OPTIONS.map(role=>role.id);
export default function Agents(){
 const [mission,setMission]=useState('');
 const [selected,setSelected]=useState(['research','engineering','quality']);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [report,setReport]=useState(null);
 const [copied,setCopied]=useState(false);
 function toggleRole(id){
  setSelected(current=>current.includes(id)?current.filter(item=>item!==id):current.length<5?[...current,id]:current);
  setError('');
 }
 async function runMission(){
  if(!mission.trim()||busy||selected.length===0)return;
  setBusy(true);setError('');setReport(null);setCopied(false);
  const roles=ORDER.filter(id=>selected.includes(id));
  const tasks=roles.map((role,index)=>{
   let dependsOn=[];
   if(role==='quality')dependsOn=roles.filter(id=>['research','engineering','data','creative','security'].includes(id));
   if(role==='coordinator')dependsOn=roles.filter(id=>id!=='coordinator');
   return {id:'specialist_'+role,role,objective:'Mission utilisateur : '+mission.trim()+'\n\nTravail attendu : '+ROLE_TASK[role],dependsOn:dependsOn.map(id=>'specialist_'+id),budget:1};
  });
  try{
   const response=await fetch(API+'/api/orchestration/run',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tasks})});
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(data.error||'La mission a échoué (HTTP '+response.status+').');
   setReport(data);
  }catch(err){setError(err.message||'Connexion au moteur d’orchestration impossible.');}
  finally{setBusy(false);}
 }
 const reportText=report?.results?.map(item=>{
  const role=ROLE_OPTIONS.find(option=>option.id===item.taskId?.replace('specialist_',''));
  return (role?.label||item.taskId)+'\n'+(item.output?.content||item.error||'Aucun rapport retourné.');
 }).join('\n\n────────────────────────\n\n')||'';
 async function copyReport(){
  try{await navigator.clipboard.writeText(reportText);setCopied(true);}
  catch{setError('Copie indisponible sur cet appareil.');}
 }
 return <section className="workspace">
  <div className="pageHead"><p className="eyebrow">INTELLIGENCE COORDONNÉE / 05</p><h1>BAYE <em>Agents</em></h1><p>Confiez une mission à plusieurs spécialistes IA. Leurs contributions sont organisées selon leurs rôles et leurs dépendances.</p></div>
  <div className="agentsLayout">
   <div className="panel">
    <div className="panelHead"><div><small>NOUVELLE MISSION</small><h2>Quel objectif devons-nous traiter ?</h2></div><span>01 / 02</span></div>
    <label htmlFor="agentMission">Votre mission</label>
    <textarea id="agentMission" rows="6" maxLength={2000} value={mission} onChange={event=>{setMission(event.target.value);setError('')}} placeholder="Décrivez le problème, le résultat attendu et les contraintes importantes…"/>
    <div className="inputFoot"><span>{mission.length} / 2 000 caractères</span><span>Évitez les informations confidentielles.</span></div>
    <div className="agentSelectHead"><div><label>Choisir les spécialistes</label><small>Sélectionnez jusqu’à 5 rôles · 1 appel IA par spécialiste</small></div><b>{selected.length}/5</b></div>
    <div className="agentChoices">{ROLE_OPTIONS.map(role=><label key={role.id} className={'agentChoice '+(selected.includes(role.id)?'selected':'')}><input type="checkbox" checked={selected.includes(role.id)} disabled={!selected.includes(role.id)&&selected.length>=5} onChange={()=>toggleRole(role.id)}/><span><b>{role.label}</b><small>{role.detail}</small></span></label>)}</div>
    <button className="primary wide" disabled={!mission.trim()||selected.length===0||busy} onClick={runMission}>{busy?'Les spécialistes travaillent…':'Lancer la mission coordonnée ↗'}</button>
    {busy&&<div className="info" role="status">Mission envoyée au gateway BAYE. Les spécialistes sont exécutés avec un maximum de deux appels simultanés.</div>}
    {error&&<div className="error" role="alert"><b>La mission n’a pas abouti</b><p>{error}</p></div>}
   </div>
   <aside className="aside">
    <div className="hint"><span>✧</span><p className="eyebrow">ORCHESTRATION</p><h3>Des rôles distincts, un objectif commun.</h3><p>Les spécialistes peuvent travailler en parallèle. Les rôles Qualité et Coordination reçoivent les rapports précédents lorsqu’ils sont sélectionnés.</p></div>
    <div className="hint quiet"><p className="eyebrow">LIMITES ACTUELLES</p><p>Chaque spécialiste effectue une inférence textuelle. Aucun navigateur, outil externe, publication, exécution de code ou vérification indépendante des faits n’est activé dans cette version.</p></div>
   </aside>
  </div>
  {report&&<div className="panel answer agentReport">
   <div className="answerHead"><div><p className="eyebrow">MISSION TERMINÉE</p><h2>Rapports des spécialistes</h2></div><button className="secondary" onClick={copyReport}>{copied?'Copié ✓':'Copier les rapports'}</button></div>
   <div className="agentMeta"><span><b>{report.plan?.taskCount??report.results?.length??0}</b> spécialistes</span><span><b>{report.status==='succeeded'?'Terminée':'Échec partiel'}</b></span><span><b>{report.plan?.totalBudget??'—'}</b> budget consommé (unités internes)</span></div>
   {report.results?.map((item,index)=>{
    const role=ROLE_OPTIONS.find(option=>option.id===item.taskId?.replace('specialist_',''));
    return <article className="specialistResult" key={item.taskId||index}><div className="specialistResultHead"><div><small>SPÉCIALISTE {String(index+1).padStart(2,'0')}</small><h3>{role?.label||item.taskId}</h3></div><span className={'resultState '+(item.status==='succeeded'?'success':'failed')}>{item.status==='succeeded'?'Terminé':'Échec'}</span></div><div className="answerText">{item.output?.content||item.error||'Aucun rapport retourné.'}</div></article>;
   })}
   <p className="agentDisclaimer">Rapports générés par le fournisseur IA configuré. Ils peuvent contenir des erreurs et doivent être vérifiés avant toute décision importante.</p>
  </div>}
 </section>;
}
