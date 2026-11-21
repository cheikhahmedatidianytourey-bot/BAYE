// BAYE Academy catalogue v1.
// These are subject and level definitions, not a claim that official curriculum
// documents have already been ingested or validated.
export const ACADEMY_LEVELS = [
  { id: 'primary', label: 'Primaire', stages: ['CI', 'CP', 'CE1', 'CE2', 'CM1', 'CM2'] },
  { id: 'middle', label: 'Collège', stages: ['6e', '5e', '4e', '3e'], exams: ['BFEM'] },
  { id: 'secondary', label: 'Lycée', stages: ['Seconde', 'Première', 'Terminale'], exams: ['Baccalauréat'] },
  { id: 'undergraduate', label: 'Université — Licence', stages: ['L1', 'L2', 'L3'] },
  { id: 'graduate', label: 'Université — Master', stages: ['M1', 'M2'] },
  { id: 'doctoral', label: 'Doctorat et recherche avancée', stages: ['Doctorat', 'Postdoctorat', 'Recherche'] }
];

export const ACADEMY_SUBJECTS = [
  { id: 'mathematics', label: 'Mathématiques', topics: ['arithmétique', 'algèbre', 'géométrie', 'fonctions', 'analyse', 'probabilités', 'statistiques', 'algèbre linéaire', 'équations différentielles', 'optimisation', 'mathématiques discrètes'] },
  { id: 'history', label: 'Histoire', topics: ['histoire du Sénégal et de l’Afrique', 'histoire ancienne', 'histoire médiévale', 'histoire moderne', 'histoire contemporaine', 'historiographie'] },
  { id: 'geography', label: 'Géographie', topics: ['cartographie', 'géographie physique', 'géographie humaine', 'climatologie', 'géopolitique', 'aménagement', 'géographie économique'] },
  { id: 'french', label: 'Français', topics: ['grammaire', 'conjugaison', 'orthographe', 'rédaction', 'dissertation', 'commentaire composé', 'littérature', 'linguistique'] },
  { id: 'english', label: 'Anglais', topics: ['grammar', 'vocabulary', 'reading', 'writing', 'speaking', 'translation', 'literature', 'linguistics'] },
  { id: 'spanish', label: 'Espagnol', topics: ['gramática', 'conjugación', 'vocabulario', 'comprensión', 'expresión oral', 'traducción', 'literatura'] },
  { id: 'wolof', label: 'Wolof', topics: ['lecture', 'écriture', 'grammaire', 'vocabulaire', 'expression', 'traduction'] },
  { id: 'physics', label: 'Physique', topics: ['mécanique', 'électricité', 'magnétisme', 'optique', 'thermodynamique', 'physique moderne'] },
  { id: 'chemistry', label: 'Chimie', topics: ['chimie générale', 'chimie organique', 'chimie inorganique', 'thermochimie', 'cinétique', 'équilibres'] },
  { id: 'biology', label: 'SVT et biologie', topics: ['cellule', 'génétique', 'écologie', 'physiologie', 'évolution', 'géologie'] },
  { id: 'computer-science', label: 'Informatique', topics: ['algorithmique', 'programmation', 'structures de données', 'bases de données', 'réseaux', 'intelligence artificielle', 'sécurité'] },
  { id: 'engineering', label: 'Sciences de l’ingénieur', topics: ['électronique', 'mécanique', 'automatique', 'énergie', 'matériaux', 'conception'] },
  { id: 'economics', label: 'Économie', topics: ['microéconomie', 'macroéconomie', 'économétrie', 'finance', 'développement'] },
  { id: 'philosophy', label: 'Philosophie', topics: ['logique', 'épistémologie', 'éthique', 'métaphysique', 'philosophie politique'] }
];

export const ACADEMY_PROGRAMS = [
  { id: 'senegal', label: 'Programme sénégalais', status: 'framework_pending', exams: ['CFEE', 'BFEM', 'Baccalauréat'], note: 'Les référentiels officiels, séries, coefficients et progressions doivent être importés et vérifiés avant de revendiquer une conformité complète.' },
  { id: 'international', label: 'Programmes internationaux', status: 'framework_pending', frameworks: ['IB', 'Cambridge International', 'IGCSE', 'A-levels', 'French Baccalauréat', 'selected university frameworks'], note: 'Chaque référentiel doit être traité comme un pack distinct, daté et vérifié. Les programmes et examens peuvent varier selon le pays et l’année.' }
];

export function getAcademyCatalog() {
  return { version: '1.0.0', levels: ACADEMY_LEVELS, subjects: ACADEMY_SUBJECTS, programs: ACADEMY_PROGRAMS };
}
