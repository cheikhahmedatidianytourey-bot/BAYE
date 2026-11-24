import express from 'express';
import rateLimit from 'express-rate-limit';
import { requireBayeService } from './service-producer-auth.js';

/**
 * Narrow, non-mutating HTTP integration proving that a signed machine producer
 * can reach the Gateway with a route-specific scope. It does not write lifecycle
 * evidence or authorize any other route.
 */
export function createServiceAuthGatewayRouter({ authenticateServiceRequest } = {}) {
  const router = express.Router();
  if (typeof authenticateServiceRequest !== 'function') {
    router.post('/verify', (_req, res) => res.status(503).json({
      error: 'Authentification des services internes non configurée.'
    }));
    return router;
  }

  const limiter = rateLimit({
    windowMs: 60_000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false
  });

  router.post(
    '/verify',
    limiter,
    express.json({
      limit: '20kb',
      strict: true,
      verify(req, _res, buffer) {
        req.rawBody = Buffer.from(buffer);
      }
    }),
    requireBayeService(authenticateServiceRequest),
    (req, res) => {
      if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
        return res.status(400).json({ error: 'Un objet JSON est requis.' });
      }
      return res.json({
        authenticated: true,
        service: {
          serviceId: req.bayeService.serviceId,
          keyId: req.bayeService.keyId,
          scopes: req.bayeService.scopes
        },
        request: {
          method: req.method,
          bodyBytes: req.rawBody.length,
          bodyAccepted: true
        },
        effects: {
          lifecycleEvidenceWritten: false,
          externalActionPerformed: false
        }
      });
    }
  );

  router.use((err, _req, res, next) => {
    if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'Corps de requête trop volumineux.' });
    if (err instanceof SyntaxError && err.status === 400) return res.status(400).json({ error: 'JSON invalide.' });
    return next(err);
  });
  return router;
}
