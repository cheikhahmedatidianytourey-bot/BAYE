import { ACADEMY_LEVELS, ACADEMY_SUBJECTS, ACADEMY_PROGRAMS } from './catalog.js';

const allowedModes = new Set(['learn', 'solve', 'correct', 'quiz', 'research']);
const allowedLanguages = new Set(['fr', 'en', 'es', 'wo']);

function findById(items, id) {
  return items.find(item => item.id === id);
}

function levelDescription(level) {
  const item = findById(ACADEMY_LEVELS, level);
  return item ? item.label + ' (' + item.stages.join(', ') + ')' : 'niveau non précisé';
}

export function validateAcademyRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: 'Demande invalide.' };
  const { subject, level, program = 'senegal', mode = 'learn', language = 'fr', prompt } = body;
  if (!findById(ACADEMY_SUBJECTS, subject)) return { ok: false, error: 'Matière non reconnue.' };
  if (!findById(ACADEMY_LEVELS, level)) return { ok: false, error: 'Niveau non reconnu.' };
  if (!ACADEMY_PROGRAMS.some(item => item.id === program)) return { ok: false, error: 'Programme non reconnu.' };
  if (!allowedModes.has(mode)) return { ok: false, error: 'Mode pédagogique non reconnu.' };
  if (!allowedLanguages.has(language)) return { ok: false, error: 'Langue non prise en charge.' };
  if (typeof prompt !== 'string' || !prompt.trim()) return { ok: false, error: 'Ajoutez un exercice ou une question.' };
  if (prompt.length > 10000) return { ok: false, error: 'La demande est trop longue (maximum 10 000 caractères).' };
  return { ok: true, value: { subject, level, program, mode, language, prompt: prompt.trim() } };
}

export function buildAcademyInstruction(input) {
  const subject = findById(ACADEMY_SUBJECTS, input.subject);
  const program = findById(ACADEMY_PROGRAMS, input.program);
  const modeRules = {
    learn: 'Agis comme un professeur particulier. Explique progressivement, vérifie les prérequis et donne un exemple puis un exercice d’application.',
    solve: 'Résous la question avec une démarche rigoureuse, toutes les étapes utiles, les unités et une vérification indépendante du résultat.',
    correct: 'Corrige le travail fourni. Distingue les erreurs de méthode, de raisonnement, de calcul, de langue et de présentation. Explique comment progresser.',
    quiz: 'Crée une évaluation adaptée au niveau, avec consignes, barème, questions progressives et corrigé séparé à la fin.',
    research: 'Adopte une démarche de recherche avancée. Définis les concepts, hypothèses, méthodes, limites, controverses et pistes de vérification. N’invente jamais de références.'
  };
  const languageRules = {
    fr: 'Réponds en français clair et précis.',
    en: 'Answer in clear, precise English.',
    es: 'Responde en español claro y preciso.',
    wo: 'Explique en wolof aussi naturellement que possible. Si un terme technique est incertain, conserve le terme scientifique et signale la limite.'
  };
  return [
    'Tu es BAYE Academy, un assistant pédagogique exigeant, patient et adapté au niveau de l’apprenant.',
    'Matière : ' + subject.label + '. Niveau : ' + levelDescription(input.level) + '.',
    'Référentiel demandé : ' + program.label + '.',
    'Important : le référentiel demandé est une cible de cadrage, pas une preuve que tous ses documents officiels sont déjà disponibles. Ne prétends pas citer une progression, un coefficient ou une exigence officielle non fournie.',
    'Mode : ' + input.mode + '. ' + modeRules[input.mode],
    languageRules[input.language],
    'Méthode : commence par reformuler brièvement le problème si cela aide; explicite les hypothèses; montre les étapes; contrôle les calculs, unités, définitions et conclusions; termine par un résumé et une question ou un exercice de transfert lorsque pertinent.',
    'Pour les mathématiques et sciences : détaille les transformations, justifie les formules, vérifie le résultat par une autre méthode lorsque possible et indique les conditions de validité.',
    'Pour l’histoire-géographie : distingue faits établis, interprétations et débats; précise les dates et échelles géographiques; évite les affirmations non sourcées.',
    'Pour les langues : explique la règle, donne des exemples naturels et distingue registre, grammaire et usage.',
    'Pour la recherche avancée : distingue résultats établis, hypothèses, limites et éléments à vérifier; ne fabrique ni citations, ni DOI, ni bibliographie.',
    'Respecte l’intégrité académique : aide à comprendre et apprendre; ne prétends pas avoir consulté des documents ou réalisé des expériences non effectuées.'
  ].join('\n');
}

export function buildAcademyReviewInstruction(input, draft) {
  return [
    'Tu es le vérificateur indépendant de BAYE Academy. Tu dois contrôler la réponse pédagogique ci-dessous.',
    'Vérifie la justesse du raisonnement, les étapes, calculs, unités, définitions, cohérence avec le niveau, clarté, biais et affirmations non justifiées.',
    'Si une erreur est détectée, corrige la réponse. Ne prétends pas qu’une source officielle ou un calculateur externe a été consulté.',
    'Si la question exige des données récentes, une référence officielle ou une littérature scientifique précise qui n’est pas fournie, indique explicitement ce qui reste à vérifier.',
    'Retourne la version finale corrigée, puis une courte rubrique « Contrôle qualité » indiquant les vérifications réellement effectuées et les limites restantes.',
    'Demande initiale : ' + input.prompt,
    'Réponse à vérifier :\n' + draft
  ].join('\n\n');
}
