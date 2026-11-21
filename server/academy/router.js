import express from 'express';
import rateLimit from 'express-rate-limit';
import { getAcademyCatalog } from './catalog.js';
import { validateAcademyRequest, buildAcademyInstruction, buildAcademyReviewInstruction } from './engine.js';
import { validateResearchRequest, buildResearchPlan, buildResearchCritique, buildResearchSynthesis } from './research.js';
import { verifyGoldbachExample } from './math-checks.js';

export function createAcademyRouter({ callAI }) {
  const router = express.Router();
  const academyLimiter = rateLimit({ windowMs: 60_000, max: 8, standardHeaders: true, legacyHeaders: false });

  router.get('/catalog', (_req, res) => res.json(getAcademyCatalog()));

  router.post('/solve', academyLimiter, async (req, res) => {
    const validation = validateAcademyRequest(req.body);
    if (!validation.ok) return res.status(400).json({ error: validation.error });
    const input = validation.value;
    const key = process.env.AI_API_KEY;
    if (!key) return res.status(503).json({ error: 'Le moteur IA de BAYE Academy n’est pas configuré.' });
    const endpoint = (process.env.AI_API_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '') + '/chat/completions';
    const model = process.env.AI_MODEL || 'gpt-4o-mini';

    try {
      const first = await callAI({
        key, endpoint, model,
        messages: [
          { role: 'system', content: buildAcademyInstruction(input) },
          { role: 'user', content: input.prompt }
        ],
        max_tokens: 6500,
        temperature: input.mode === 'research' ? 0.2 : 0.25
      });
      const deterministicCheck = verifyGoldbachExample(input.prompt);\n      const reviewed = await callAI({
        key, endpoint, model,
        messages: [
          { role: 'system', content: 'Tu effectues une seconde lecture critique. Ce n’est pas une vérification indépendante ni une preuve formelle. Corrige les erreurs sans inventer de preuves.' },
          { role: 'user', content: buildAcademyReviewInstruction(input, first.piece, deterministicCheck) }
        ],
        max_tokens: 6500,
        temperature: 0.1
      });
      return res.json({
        result: reviewed.piece,
        subject: input.subject,
        level: input.level,
        program: input.program,
        mode: input.mode,
        language: input.language,
        model,
        review: 'second_pass_model_review',
        limitations: [
          'La vérification est une seconde passe du modèle, pas une preuve mathématique formelle.',
          'Les référentiels officiels sénégalais et internationaux doivent être importés et validés séparément.',
          'Les réponses de recherche avancée nécessitant des sources récentes doivent être documentées par des références vérifiables.'
        ]
      });
    } catch (error) {
      console.error('BAYE Academy error', error);
      return res.status(502).json({ error: 'BAYE Academy n’a pas pu terminer la réponse. Réessaie plus tard.' });
    }
  });


  // BAYE Mathematical Discovery Lab: multi-stage research exploration with adversarial review.
  // The same configured foundation model is used at each stage; this is not independent
  // model consensus and does not constitute formal proof verification.
  const researchLimiter = rateLimit({ windowMs: 60_000, max: 3, standardHeaders: true, legacyHeaders: false });

  router.get('/research/status', (_req, res) => res.json({
    name: 'BAYE Mathematical Discovery Lab',
    version: '1.0.0',
    available: true,
    workflow: ['problem_analysis', 'candidate_generation', 'adversarial_critique', 'research_synthesis'],
    foundationModel: 'configured external provider',
    independentModelConsensus: false,
    formalProofVerification: false,
    symbolicComputation: false,
    webLiteratureSearch: false,
    policy: 'Generated approaches are hypotheses until independently verified.'
  }));

  router.post('/research', researchLimiter, async (req, res) => {
    const validation = validateResearchRequest(req.body);
    if (!validation.ok) return res.status(400).json({ error: validation.error });
    const input = validation.value;
    const key = process.env.AI_API_KEY;
    if (!key) return res.status(503).json({ error: 'Le moteur IA de recherche BAYE n’est pas configuré.' });
    const endpoint = (process.env.AI_API_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '') + '/chat/completions';
    const model = process.env.AI_MODEL || 'gpt-4o-mini';

    try {
      const analysis = await callAI({
        key, endpoint, model,
        messages: [
          { role: 'system', content: buildResearchPlan(input) },
          { role: 'user', content: input.problem }
        ],
        max_tokens: 3500,
        temperature: 0.15
      });
      const candidate = await callAI({
        key, endpoint, model,
        messages: [
          { role: 'system', content: 'Tu es un mathématicien exploratoire. Propose une ou plusieurs pistes précises, mais marque chaque idée non démontrée comme conjecturale. Ne prétends jamais avoir prouvé un résultat ouvert.' },
          { role: 'user', content: 'Problème :\\n' + input.problem + '\\nAnalyse préalable :\\n' + analysis.piece }
        ],
        max_tokens: 4500,
        temperature: 0.25
      });
      const critique = await callAI({
        key, endpoint, model,
        messages: [
          { role: 'system', content: 'Tu es un auditeur mathématique contradicteur. Cherche les failles et contre-exemples, pas la confirmation.' },
          { role: 'user', content: buildResearchCritique(input, analysis.piece, candidate.piece) }
        ],
        max_tokens: 3500,
        temperature: 0.1
      });
      const synthesis = await callAI({
        key, endpoint, model,
        messages: [
          { role: 'system', content: 'Tu rédiges un rapport de recherche mathématique prudent. Aucune piste ne doit être présentée comme preuve sans vérification formelle.' },
          { role: 'user', content: buildResearchSynthesis(input, analysis.piece, candidate.piece, critique.piece) }
        ],
        max_tokens: 5500,
        temperature: 0.1
      });
      return res.json({
        report: synthesis.piece,
        researchLab: 'BAYE Mathematical Discovery Lab v1',
        workflow: ['problem_analysis', 'candidate_generation', 'adversarial_critique', 'research_synthesis'],
        model,
        verification: {
          method: 'same_model_multi_stage_adversarial_review',
          independentModelConsensus: false,
          formalProofChecked: false,
          symbolicComputationPerformed: false,
          literatureSearchPerformed: false
        },
        status: 'exploratory_not_a_proof'
      });
    } catch (error) {
      console.error('BAYE research lab error', error);
      return res.status(502).json({ error: 'Le laboratoire BAYE n’a pas pu terminer cette exploration. Réessaie plus tard.' });
    }
  });

  return router;
}
