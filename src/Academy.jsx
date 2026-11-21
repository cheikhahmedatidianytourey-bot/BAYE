import React, { useState } from 'react';

const API = 'https://baye-ai-gateway.onrender.com';
const subjects = [
  ['mathematics','Mathématiques'],['history','Histoire'],['geography','Géographie'],
  ['french','Français'],['english','Anglais'],['spanish','Espagnol'],['wolof','Wolof'],
  ['physics','Physique'],['chemistry','Chimie'],['biology','SVT et biologie'],
  ['computer-science','Informatique'],['engineering','Sciences de l’ingénieur'],
  ['economics','Économie'],['philosophy','Philosophie']
];
const levels = [
  ['primary','Primaire'],['middle','Collège'],['secondary','Lycée'],
  ['undergraduate','Université — Licence'],['graduate','Université — Master'],
  ['doctoral','Doctorat et recherche avancée']
];

export default function Academy() {
  const [subject,setSubject] = useState('mathematics');
  const [level,setLevel] = useState('secondary');
  const [program,setProgram] = useState('senegal');
  const [mode,setMode] = useState('learn');
  const [objective,setObjective] = useState('explore');
  const [language,setLanguage] = useState('fr');
  const [prompt,setPrompt] = useState('');
  const [result,setResult] = useState('');
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);

  async function submit() {
    if (!prompt.trim() || busy) return;
    setBusy(true); setError(''); setResult('');
    try {
      const research = mode === 'research';
      const response = await fetch(API + (research ? '/api/academy/research' : '/api/academy/solve'), {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify(research
          ? {problem:prompt.trim(),field:subject,objective}
          : {subject,level,program,mode,language,prompt:prompt.trim()})
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Erreur HTTP ' + response.status);
      const answer = research ? data.report : data.result;
      if (!answer) throw new Error('Réponse pédagogique vide.');
      setResult(answer);
    } catch (err) {
      setError(err.message || 'Connexion impossible.');
    } finally {
      setBusy(false);
    }
  }

  const research = mode === 'research';

  return <section className="workspace">
    <div className="pageHead">
      <p className="eyebrow">APPRENTISSAGE / RECHERCHE</p>
      <h1>BAYE <em>Academy</em></h1>
      <p>Du primaire à la recherche avancée. Apprenez, résolvez, corrigez et approfondissez.</p>
    </div>
    <div className="workGrid">
      <div className="panel">
        <div className="panelHead"><div><small>{research ? 'LABORATOIRE DE RECHERCHE' : 'ESPACE PÉDAGOGIQUE'}</small><h2>{research ? 'Votre problème de recherche' : 'Votre question ou exercice'}</h2></div><span>{research ? 'DISCOVERY LAB' : 'ACADEMY 01'}</span></div>
        <label>Matière / domaine</label>
        <select value={subject} onChange={e=>setSubject(e.target.value)}>{subjects.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select>
        {!research && <><label>Niveau</label>
        <select value={level} onChange={e=>setLevel(e.target.value)}>{levels.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select>
        <label>Programme</label>
        <select value={program} onChange={e=>setProgram(e.target.value)}><option value="senegal">Programme sénégalais</option><option value="international">Programmes internationaux</option></select></>}
        <label>Mode de travail</label>
        <select value={mode} onChange={e=>{setMode(e.target.value);setResult('');setError('')}}>
          <option value="learn">M’apprendre et m’expliquer</option><option value="solve">Résoudre un exercice</option>
          <option value="correct">Corriger mon travail</option><option value="quiz">Créer une évaluation</option>
          <option value="research">Laboratoire de recherche mathématique</option>
        </select>
        {research && <><label>Objectif de recherche</label>
          <select value={objective} onChange={e=>setObjective(e.target.value)}>
            <option value="explore">Explorer des pistes</option><option value="prove">Étudier une stratégie de preuve</option>
            <option value="refute">Chercher une réfutation / contre-exemple</option><option value="review">Auditer un raisonnement existant</option>
          </select>
        </>}
        {!research && <><label>Langue de réponse</label>
        <select value={language} onChange={e=>setLanguage(e.target.value)}>
          <option value="fr">Français</option><option value="en">English</option><option value="es">Español</option><option value="wo">Wolof (explication)</option>
        </select></>}
        <label htmlFor="academyPrompt">{research ? 'Énoncé, conjecture ou problème' : 'Votre question, exercice ou sujet'}</label>
        <textarea id="academyPrompt" rows="7" maxLength={research ? 12000 : 10000} value={prompt} onChange={e=>setPrompt(e.target.value)} placeholder={research ? 'Formulez précisément le problème, les hypothèses et le résultat recherché…' : 'Collez votre exercice, décrivez la notion à comprendre ou formulez votre question…'}/>
        <button className="primary wide" disabled={!prompt.trim()||busy} onClick={submit}>{busy?'BAYE travaille…':research?'Lancer l’exploration ↗':'Analyser et apprendre ↗'}</button>
        {error&&<div className="error" role="alert"><b>La demande n’a pas abouti</b><p>{error}</p></div>}
      </div>
      <aside className="aside">
        <div className="hint"><span>✧</span><p className="eyebrow">{research ? 'DÉMARCHE SCIENTIFIQUE' : 'APPRENDRE EN PROFONDEUR'}</p><h3>{research ? 'Une piste n’est pas une preuve.' : 'Comprendre vaut mieux que mémoriser.'}</h3><p>{research ? 'Le laboratoire analyse, propose des pistes, cherche des failles et synthétise les résultats avec prudence.' : 'BAYE détaille les méthodes, justifie les étapes et vérifie les résultats avant de conclure.'}</p></div>
        {research ? <div className="hint quiet"><p className="eyebrow">LIMITES DE CETTE VERSION</p><p>Les quatre étapes utilisent le même modèle IA. Aucun calcul symbolique, assistant de preuve formelle (Lean) ou moteur de recherche scientifique n’est encore connecté. Les résultats restent exploratoires et non vérifiés formellement.</p></div> : <div className="hint quiet"><p className="eyebrow">PROGRAMMES</p><p>Le catalogue de matières et de niveaux est intégré. L’import et la validation des référentiels officiels sénégalais et internationaux restent à réaliser.</p></div>}
      </aside>
    </div>
    {result&&<div className="panel answer"><div className="answerHead"><div><p className="eyebrow">{research ? 'RAPPORT DU DISCOVERY LAB' : 'RÉSULTAT PÉDAGOGIQUE'}</p><h2>{research ? 'Exploration et audit contradictoire' : 'Explication et correction'}</h2></div></div><div className="answerText">{result}</div>{research&&<p className="inputFoot">Statut : exploration non équivalente à une preuve. Toute affirmation mathématique doit être vérifiée indépendamment.</p>}</div>}
  </section>;
}
