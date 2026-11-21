import express from 'express';
import rateLimit from 'express-rate-limit';
import { getAcademyCatalog } from './catalog.js';
import { validateAcademyRequest, buildAcademyInstruction, buildAcademyReviewInstruction } from './engine.js';

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
      const reviewed = await callAI({
        key, endpoint, model,
        messages: [
          { role: 'system', content: 'Tu effectues une vérification pédagogique et disciplinaire indépendante. Corrige les erreurs sans inventer de preuves.' },
          { role: 'user', content: buildAcademyReviewInstruction(input, first.piece) }
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

  return router;
}
