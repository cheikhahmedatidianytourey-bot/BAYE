// BAYE Mathematical Discovery Lab v1.
// Research orchestration only: it does not prove that a conjecture is solved.
// All generated ideas remain provisional until independently checked.
export const RESEARCH_STATUSES = [
  'known_result',
  'candidate_approach',
  'partial_lemma',
  'counterexample_found',
  'unverified_claim',
  'formal_proof_not_checked'
];

export function validateResearchRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'Demande de recherche invalide.' };
  }
  const { problem, field = 'mathematics', objective = 'explore' } = body;
  if (typeof problem !== 'string' || !problem.trim()) {
    return { ok: false, error: 'Décris le problème mathématique à étudier.' };
  }
  if (problem.length > 12000) {
    return { ok: false, error: 'Le problème dépasse 12 000 caractères.' };
  }
  if (typeof field !== 'string' || field.length > 100) {
    return { ok: false, error: 'Domaine scientifique invalide.' };
  }
  if (!['explore', 'prove', 'refute', 'review'].includes(objective)) {
    return { ok: false, error: 'Objectif de recherche non reconnu.' };
  }
  return { ok: true, value: { problem: problem.trim(), field, objective } };
}

export function buildResearchPlan(input) {
  return [
    'Tu es BAYE Mathematical Discovery Lab, un assistant de recherche prudent et rigoureux.',
    'Domaine : ' + input.field + '. Objectif : ' + input.objective + '.',
    'Analyse le problème sans supposer qu’il est soluble ni qu’une solution existe.',
    '1. Reformule précisément les définitions, hypothèses et conclusion recherchée.',
    '2. Sépare les résultats connus, les hypothèses fournies et les inconnues.',
    '3. Identifie les théorèmes applicables et les conditions exactes de leur usage. Ne fabrique aucune référence.',
    '4. Décompose le problème en lemmes ou obligations de preuve vérifiables.',
    '5. Propose plusieurs stratégies distinctes si cela est pertinent, avec leurs risques.',
    '6. Signale les calculs ou étapes qui nécessitent un outil externe.',
    'N’annonce jamais la résolution d’un problème ouvert sur la base d’une intuition, d’exemples numériques ou d’une réponse générée.'
  ].join('\n');
}

export function buildResearchCritique(input, plan, candidate) {
  return [
    'Tu es l’auditeur contradicteur du laboratoire BAYE. Tu dois chercher à réfuter la proposition, pas à la défendre.',
    'Vérifie chaque inférence, hypothèse cachée, quantificateur, condition aux limites, cas particulier et dépendance à un théorème.',
    'Cherche un contre-exemple, un cas limite ou une circularité. Distingue preuve, heuristique, calcul expérimental et conjecture.',
    'Si une étape n’est pas justifiée, marque-la comme lacune. Ne complète pas silencieusement une preuve incomplète.',
    'Problème :\n' + input.problem,
    'Plan initial :\n' + plan,
    'Proposition à auditer :\n' + candidate,
    'Retourne une liste précise des points valides, lacunes, contre-exemples possibles et vérifications nécessaires.'
  ].join('\n\n');
}

export function buildResearchSynthesis(input, plan, candidate, critique) {
  return [
    'Tu es le rapporteur scientifique final de BAYE Mathematical Discovery Lab.',
    'Produis un rapport honnête et exploitable. Ne transforme pas une piste en théorème.',
    'Utilise explicitement les statuts suivants selon le cas : résultat connu, approche candidate, lemme partiel, contre-exemple trouvé, affirmation non vérifiée, preuve formelle non contrôlée.',
    'Structure : formulation; connaissances supposées; stratégies explorées; proposition; audit contradictoire; lacunes; prochaines expériences ou preuves à établir; conclusion avec statut.',
    'Une preuve n’est « formellement vérifiée » que si un assistant de preuve l’a effectivement compilée. Aucun assistant de preuve n’est appelé par cette version.',
    'Ne prétends pas avoir consulté des articles, bases de données, calculatrices symboliques ou Lean.',
    'Problème :\n' + input.problem,
    'Analyse :\n' + plan,
    'Piste candidate :\n' + candidate,
    'Audit contradictoire :\n' + critique
  ].join('\n\n');
}
