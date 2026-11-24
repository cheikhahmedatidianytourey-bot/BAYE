import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

const SERVICE_ID = /^[A-Za-z0-9_-]{1,32}$/;
const KEY_ID = /^[A-Za-z0-9_-]{1,32}$/;
const NONCE = /^[A-Za-z0-9_-]{16,128}$/;
const SIGNATURE = /^[a-f0-9]{64}$/;
const MAX_PATH_LENGTH = 2048;

function safeEqualHex(left, right) {
  if (!SIGNATURE.test(left) || !SIGNATURE.test(right)) return false;
  return timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}

function header(request, name) {
  if (typeof request?.get === 'function') return request.get(name) ?? '';
  const value = request?.headers?.[name.toLowerCase()];
  return typeof value === 'string' ? value : '';
}

/**
 * Creates a fail-closed authenticator for machine-to-machine event producers.
 *
 * Signature input is the exact HTTP method, request target, timestamp, nonce,
 * SHA-256 digest of raw request bytes, service ID, and key ID. The caller must
 * capture raw request bytes before JSON parsing (for example body-parser's
 * verify callback) whenever a request has a body.
 */
export function createBayeServiceAuthenticator({
  services,
  nonceStore,
  requiredScope,
  now = () => Date.now(),
  maxAgeMs = 30_000
} = {}) {
  if (!services || typeof services !== 'object' || Array.isArray(services) || Object.keys(services).length === 0) {
    throw new TypeError('A non-empty service registry is required.');
  }
  if (!nonceStore || typeof nonceStore.consume !== 'function') {
    throw new TypeError('An atomic service nonce store is required.');
  }
  if (typeof requiredScope !== 'string' || !/^[a-z][a-z0-9:_-]{2,63}$/.test(requiredScope)) {
    throw new TypeError('A valid required service scope is required.');
  }
  if (typeof now !== 'function') throw new TypeError('A clock function is required.');
  if (!Number.isSafeInteger(maxAgeMs) || maxAgeMs < 1_000 || maxAgeMs > 300_000) {
    throw new TypeError('maxAgeMs must be between 1000 and 300000.');
  }

  const registry = new Map();
  for (const [serviceId, service] of Object.entries(services)) {
    if (!SERVICE_ID.test(serviceId) || !service || typeof service !== 'object' || Array.isArray(service)) {
      throw new TypeError('Invalid service registry entry.');
    }
    if (!Array.isArray(service.scopes) || service.scopes.some(scope =>
      typeof scope !== 'string' || !/^[a-z][a-z0-9:_-]{2,63}$/.test(scope)
    )) throw new TypeError('Each service must declare valid scopes.');
    if (!service.keys || typeof service.keys !== 'object' || Array.isArray(service.keys) || Object.keys(service.keys).length === 0) {
      throw new TypeError('Each service must declare at least one signing key.');
    }
    const keys = new Map();
    for (const [keyId, secret] of Object.entries(service.keys)) {
      if (!KEY_ID.test(keyId) || typeof secret !== 'string' || Buffer.byteLength(secret) < 32) {
        throw new TypeError('Service signing keys require valid IDs and secrets of at least 32 bytes.');
      }
      keys.set(keyId, secret);
    }
    registry.set(serviceId, Object.freeze({ scopes: Object.freeze([...new Set(service.scopes)]), keys }));
  }

  return async function authenticateServiceRequest(request) {
    try {
      const serviceId = header(request, 'x-baye-service-id');
      const keyId = header(request, 'x-baye-key-id');
      const timestampText = header(request, 'x-baye-timestamp');
      const nonce = header(request, 'x-baye-nonce');
      const signature = header(request, 'x-baye-signature');
      const service = registry.get(serviceId);
      const secret = service?.keys.get(keyId);
      if (!service || !secret || !service.scopes.includes(requiredScope)) return null;
      if (!/^\d{1,16}$/.test(timestampText)) return null;
      const timestamp = Number(timestampText);
      if (!Number.isSafeInteger(timestamp) || typeof nonce !== 'string' || !NONCE.test(nonce)) return null;
      if (!SIGNATURE.test(signature)) return null;

      const method = request?.method;
      const target = request?.originalUrl ?? request?.url;
      if (typeof method !== 'string' || !/^[A-Z]{1,16}$/.test(method)) return null;
      if (typeof target !== 'string' || !target.startsWith('/') || target.length > MAX_PATH_LENGTH || /[\r\n]/.test(target)) return null;

      let rawBody = request.rawBody;
      if (rawBody === undefined && (request.body === undefined || request.body === null)) rawBody = Buffer.alloc(0);
      if (!Buffer.isBuffer(rawBody)) return null;

      const current = now();
      if (!Number.isSafeInteger(current) || Math.abs(current - timestamp) > maxAgeMs) return null;
      const bodyDigest = createHash('sha256').update(rawBody).digest('hex');
      const canonical = [method, target, timestampText, nonce, bodyDigest, serviceId, keyId].join('\n');
      const expected = createHmac('sha256', secret).update(canonical, 'utf8').digest('hex');
      if (!safeEqualHex(signature, expected)) return null;

      const consumed = await nonceStore.consume({
        keyId: 'svc_' + serviceId + '_' + keyId,
        nonce,
        expiresAt: timestamp + maxAgeMs
      });
      if (consumed !== true) return null;
      return Object.freeze({ serviceId, keyId, scopes: service.scopes });
    } catch {
      return null;
    }
  };
}

/** Express middleware factory. Attach only to explicitly scoped service routes. */
export function requireBayeService(authenticateServiceRequest) {
  if (typeof authenticateServiceRequest !== 'function') {
    throw new TypeError('A service authenticator function is required.');
  }
  return async function bayeServiceAuthenticationMiddleware(req, res, next) {
    const principal = await authenticateServiceRequest(req);
    if (!principal) return res.status(401).json({ error: 'Authentification du service BAYE invalide ou expirée.' });
    req.bayeService = principal;
    return next();
  };
}
