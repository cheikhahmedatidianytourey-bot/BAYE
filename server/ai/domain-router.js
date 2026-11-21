import { buildBayeCorePrompt } from '../baye-core.js';

export const BAYE_DOMAINS = Object.freeze([
  { id: 'mathematics', label: 'Mathématiques', terms: ['math', 'mathematique', 'équation', 'equation', 'algèbre', 'algebre', 'géométrie', 'geometrie', 'calcul', 'théorème', 'theoreme', 'conjecture', 'intégrale', 'integrale', 'dérivée', 'derivee', 'probabilité', 'probabilite'] },
  { id: 'physics', label: 'Physique', terms: ['physique', 'mécanique', 'mecanique', 'quantique', 'électricité', 'electricite', 'thermodynamique', 'relativité', 'relativite'] },
  { id: 'chemistry', label: 'Chimie', terms: ['chimie', 'molécule', 'molecule', 'réaction chimique', 'reaction chimique', 'atome', 'liaison chimique'] },
  { id: 'biology', label: 'Biologie', terms: ['biologie', 'cellule', 'génétique', 'genetique', 'écologie', 'ecologie', 'organisme', 'adn'] },
  { id: 'medicine', label: 'Médecine et santé', terms: ['médecine', 'medecine', 'médical', 'medical', 'symptôme', 'symptome', 'diagnostic', 'traitement', 'santé', 'sante', 'posologie'] },
  { id: 'computer_science', label: 'Informatique et programmation', terms: ['code', 'programmer', 'programmation', 'javascript', 'python', 'typescript', 'api', 'algorithme', 'logiciel', 'base de données', 'base de donnees', 'bug', 'débogage', 'debug'] },
  { id: 'engineering', label: 'Ingénierie', terms: ['ingénierie', 'ingenierie', 'ingénieur', 'ingenieur', 'moteur', 'robotique', 'électronique', 'electronique', 'mécatronique', 'mecatronique', 'structure', 'matériau', 'materiau'] },
  { id: 'ai', label: 'Intelligence artificielle', terms: ['intelligence artificielle', 'machine learning', 'deep learning', 'réseau neuronal', 'reseau neuronal', 'llm', 'modèle ia', 'modele ia', 'agent ia'] },
  { id: 'cybersecurity', label: 'Cybersécurité', terms: ['cybersécurité', 'cybersecurite', 'sécurité informatique', 'securite informatique', 'pentest', 'vulnérabilité', 'vulnerabilite', 'chiffrement', 'authentification'] },
  { id: 'economics', label: 'Économie et finance', terms: ['économie', 'economie', 'finance', 'comptabilité', 'comptabilite', 'budget', 'investissement', 'marché', 'marche', 'inflation'] },
  { id: 'law', label: 'Droit', terms: ['droit', 'juridique', 'contrat', 'loi', 'réglementation', 'reglementation', 'jurisprudence', 'légal', 'legal'] },
  { id: 'history', label: 'Histoire', terms: ['histoire', 'historique', 'civilisation', 'chronologie', 'empire', 'archéologie', 'archeologie'] },
  { id: 'geography', label: 'Géographie', terms: ['géographie', 'geographie', 'climat', 'population', 'territoire', 'cartographie', 'urbanisme'] },
  { id: 'languages', label: 'Langues et linguistique', terms: ['traduction', 'grammaire', 'conjugaison', 'vocabulaire', 'linguistique', 'anglais', 'français', 'francais', 'espagnol', 'wolof'] },
  { id: 'literature', label: 'Littérature et écriture', terms: ['littérature', 'litterature', 'roman', 'poésie', 'poesie', 'récit', 'recit', 'écriture', 'ecriture', 'scénario', 'scenario'] },
  { id: 'philosophy', label: 'Philosophie', terms: ['philosophie', 'éthique', 'ethique', 'métaphysique', 'metaphysique', 'épistémologie', 'epistemologie'] },
  { id: 'education', label: 'Pédagogie et éducation', terms: ['pédagogie', 'pedagogie', 'enseignement', 'apprentissage', 'cours', 'exercice', 'programme scolaire'] },
  { id: 'business', label: 'Entrepreneuriat et stratégie', terms: ['entreprise', 'entrepreneuriat', 'business plan', 'stratégie', 'strategie', 'marketing', 'vente', 'client', 'marché cible', 'marche cible'] },
  { id: 'arts', label: 'Arts et création', terms: ['design', 'graphisme', 'musique', 'composition', 'photographie', 'cinéma', 'cinema', 'architecture artistique'] },
  { id: 'general', label: 'Connaissances générales', terms: [] }
]);

const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const DOMAIN_METHODS = {
  mathematics: 'MÉTHODE MATHÉMATIQUE : définis les objets et hypothèses; vérifie les domaines et conditions; déroule les calculs sans sauts injustifiés; distingue preuve générale, exemple numérique, conjecture et calcul fini. Ne présente jamais un problème ouvert comme résolu.',
  physics: 'MÉTHODE PHYSIQUE : précise le système, les hypothèses, les unités SI, les lois utilisées et leur domaine de validité; contrôle les dimensions et ordres de grandeur.',
  chemistry: 'MÉTHODE CHIMIE : équilibre les équations, conserve atomes et charges, précise conditions, concentrations et risques; ne propose pas de manipulation dangereuse.',
  biology: 'MÉTHODE BIOLOGIE : distingue mécanisme établi, modèle, corrélation et hypothèse; précise l’échelle biologique et les limites des données.',
  medicine: 'MÉTHODE SANTÉ : information générale et prudente, jamais diagnostic certain; signale les urgences et recommande un professionnel qualifié pour décisions individuelles. N’invente pas posologies ni interactions.',
  computer_science: 'MÉTHODE INFORMATIQUE : propose une solution exécutable et maintenable; indique versions, dépendances, fichiers, tests, complexité et risques de sécurité. Ne prétends pas avoir exécuté le code sans preuve.',
  engineering: 'MÉTHODE INGÉNIERIE : explicite exigences, contraintes, matériaux, tolérances, calculs, normes à vérifier, modes de défaillance et essais de validation. Ne présente pas une conception comme certifiée.',
  ai: 'MÉTHODE IA : distingue entraînement, inférence, orchestration, récupération documentaire et outils; précise données, évaluation, coûts, latence, sécurité et limites.',
  cybersecurity: 'MÉTHODE CYBERSÉCURITÉ : travaille dans un cadre autorisé et défensif; privilégie analyse de risque, durcissement, détection et remédiation; refuse le vol d’accès et l’intrusion non autorisée.',
  economics: 'MÉTHODE ÉCONOMIE/FINANCE : explicite hypothèses, unités monétaires, horizon, risques, scénarios et incertitudes; ne garantis aucun rendement.',
  law: 'MÉTHODE DROIT : identifie pays, juridiction, date et domaine; distingue information générale et conseil juridique; signale les textes à vérifier.',
  history: 'MÉTHODE HISTOIRE : distingue sources primaires, faits établis, interprétations et controverses; donne dates et contexte sans inventer de références.',
  geography: 'MÉTHODE GÉOGRAPHIE : précise échelle spatiale, période, unités et sources; distingue observation, modèle et projection.',
  languages: 'MÉTHODE LANGUES : respecte langue, registre et contexte culturel; explique les variantes et signale les formulations incertaines.',
  literature: 'MÉTHODE ÉCRITURE : respecte genre, public, cohérence, rythme, voix et originalité; évite de copier le style vivant d’un auteur.',
  philosophy: 'MÉTHODE PHILOSOPHIE : définis les concepts, reconstruis les arguments, identifie prémisses, objections et implications; distingue argument et fait empirique.',
  education: 'MÉTHODE PÉDAGOGIQUE : adapte la progression au niveau; explique, illustre, vérifie la compréhension et propose des exercices corrigés.',
  business: 'MÉTHODE ENTREPRISE : analyse besoin client, proposition de valeur, marché, coûts, revenus, risques, opérations et indicateurs; sépare hypothèses et données validées.',
  arts: 'MÉTHODE CRÉATIVE : transforme le brief en direction artistique cohérente, avec contraintes, intention, composition et critères de qualité.',
  general: 'MÉTHODE GÉNÉRALE : réponds de façon structurée, exacte, utile et proportionnée; explicite les incertitudes.'
};

export function routeBayeDomain(prompt, kind = 'Texte') {
  const text = normalize(String(kind) + ' ' + String(prompt));
  let best = { domain: 'general', score: 0 };
  for (const domain of BAYE_DOMAINS) {
    if (domain.id === 'general') continue;
    const score = domain.terms.reduce((sum, term) => sum + (text.includes(normalize(term)) ? Math.max(1, normalize(term).split(' ').length) : 0), 0);
    if (score > best.score) best = { domain: domain.id, score };
  }
  const selected = BAYE_DOMAINS.find(item => item.id === best.domain) || BAYE_DOMAINS.at(-1);
  return { domain: selected.id, label: selected.label, confidence: best.score === 0 ? 'fallback' : best.score >= 3 ? 'strong_keyword_match' : 'keyword_match', score: best.score };
}

export function buildDomainSystemPrompt(kind, prompt) {
  const route = routeBayeDomain(prompt, kind);
  return {
    route,
    systemPrompt: [
      buildBayeCorePrompt(kind),
      'BAYE DOMAIN ROUTER: domaine sélectionné = ' + route.label + '.',
      DOMAIN_METHODS[route.domain],
      'Si la demande traverse plusieurs domaines, signale les disciplines mobilisées et traite leurs interactions au lieu de forcer une seule spécialité.',
      'Ne confonds jamais expertise de rédaction avec preuve scientifique, validation réglementaire, diagnostic médical ou certification professionnelle.'
    ].join('\n')
  };
}

export function getBayeCapabilityCatalog() {
  return {
    product: 'BAYE',
    architectureVersion: '1.0.0',
    routing: { mode: 'deterministic_keyword_router', confidenceIsProbabilistic: false },
    domains: BAYE_DOMAINS.map(({ id, label }) => ({ id, label })),
    runtime: {
      foundationModel: 'external_provider_configured_by_environment',
      independentMultiModelConsensus: false,
      formalProofVerification: false,
      localFoundationModel: false,
      liveWebResearch: false,
      persistentUserMemory: false,
      mediaProvider: 'external_fal_adapter',
      livePaymentProcessing: false
    },
    principle: 'A capability is operational only when its implementation and verification are present.'
  };
}
