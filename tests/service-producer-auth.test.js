import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, createHash } from 'node:crypto';
import { createBayeServiceAuthenticator, requireBayeService } from '../server/service-producer-auth.js';

const secret = 'service-producer-secret-material-32-bytes';
const timestamp = 1_700_000_000_000;
const body = Buffer.from(JSON.stringify({ event: 'lifecycle.updated' }));
const serviceRegistry = {
  'lifecycle-producer': {
    keys: { 'key-2026-01': secret },
    scopes: ['lifecycle:evidence:write']
  },
  'read-only-agent': {
    keys: { 'read-key': 'read-only-secret-material-32-bytes!!' },
    scopes: ['lifecycle:evidence:read']
  }
};

function makeRequest(overrides = {}) {
  const headers = {
    'x-baye-service-id': 'lifecycle-producer',
    'x-baye-key-id': 'key-2026-01',
    'x-baye-timestamp': String(timestamp),
    'x-baye-nonce': 'service_nonce_123456',
    'x-baye-signature': '',
    ...overrides.headers
  };
  const request = {
    method: 'POST',
    originalUrl: '/internal/lifecycle/evidence',
    rawBody: body,
    get(name) { return headers[name.toLowerCase()] ?? ''; },
    ...overrides
  };
  const canonical = [
    request.method,
    request.originalUrl,
    headers['x-baye-timestamp'],
    headers['x-baye-nonce'],
    createHash('sha256').update(request.rawBody).digest('hex'),
    headers['x-baye-service-id'],
    headers['x-baye-key-id']
  ].join('\n');
  headers['x-baye-signature'] = createHmac('sha256', secret).update(canonical).digest('hex');
  return request;
}

function setup({ consume = async () => true, clock = () => timestamp } = {}) {
  const calls = [];
  const authenticate = createBayeServiceAuthenticator({
    services: serviceRegistry,
    nonceStore: { async consume(value) { calls.push(value); return consume(value); } },
    requiredScope: 'lifecycle:evidence:write',
    now: clock
  });
  return { authenticate, calls };
}

test('accepts a valid scoped service signature and consumes a namespaced nonce', async () => {
  const { authenticate, calls } = setup();
  const principal = await authenticate(makeRequest());
  assert.equal(principal.serviceId, 'lifecycle-producer');
  assert.equal(principal.keyId, 'key-2026-01');
  assert.deepEqual(principal.scopes, ['lifecycle:evidence:write']);
  assert.deepEqual(calls, [{
    keyId: 'svc_lifecycle-producer_key-2026-01',
    nonce: 'service_nonce_123456',
    expiresAt: timestamp + 30_000
  }]);
});

test('rejects a modified body, method, or request target before nonce consumption', async () => {
  for (const mutate of [
    request => { request.rawBody = Buffer.from('{"event":"forged"}'); },
    request => { request.method = 'PUT'; },
    request => { request.originalUrl = '/internal/other'; }
  ]) {
    const { authenticate, calls } = setup();
    const request = makeRequest();
    mutate(request);
    assert.equal(await authenticate(request), null);
    assert.equal(calls.length, 0);
  }
});

test('rejects unknown services, keys, missing scope, stale timestamps and malformed signatures', async () => {
  const { authenticate, calls } = setup();
  const unknownService = makeRequest();
  unknownService.get = name => name.toLowerCase() === 'x-baye-service-id' ? 'unknown' :
    name.toLowerCase() === 'x-baye-signature' ? unknownService.headers?.['x-baye-signature'] ?? '' : '';
  assert.equal(await authenticate(unknownService), null);

  const readOnly = makeRequest();
  const headers = {
    'x-baye-service-id': 'read-only-agent',
    'x-baye-key-id': 'read-key',
    'x-baye-timestamp': String(timestamp),
    'x-baye-nonce': 'service_nonce_123456',
    'x-baye-signature': '0'.repeat(64)
  };
  readOnly.get = name => headers[name.toLowerCase()] ?? '';
  assert.equal(await authenticate(readOnly), null);

  const stale = makeRequest();
  const staleHeaders = {};
  for (const name of ['service-id','key-id','timestamp','nonce','signature']) staleHeaders['x-baye-'+name] = stale.get('x-baye-'+name);
  staleHeaders['x-baye-timestamp'] = String(timestamp - 60_000);
  stale.get = name => staleHeaders[name.toLowerCase()] ?? '';
  assert.equal(await authenticate(stale), null);

  const malformed = makeRequest();
  const malformedHeaders = {};
  for (const name of ['service-id','key-id','timestamp','nonce','signature']) malformedHeaders['x-baye-'+name] = malformed.get('x-baye-'+name);
  malformedHeaders['x-baye-signature'] = 'not-a-signature';
  malformed.get = name => malformedHeaders[name.toLowerCase()] ?? '';
  assert.equal(await authenticate(malformed), null);
  assert.equal(calls.length, 0);
});

test('rejects nonce replay and fails closed when nonce storage is unavailable', async () => {
  const replay = setup({ consume: async () => false });
  assert.equal(await replay.authenticate(makeRequest()), null);
  const unavailable = setup({ consume: async () => { throw new Error('database unavailable'); } });
  assert.equal(await unavailable.authenticate(makeRequest()), null);
});

test('requires explicit service registry, atomic nonce store, scope and strong keys', () => {
  assert.throws(() => createBayeServiceAuthenticator(), /service registry/);
  assert.throws(() => createBayeServiceAuthenticator({ services: serviceRegistry }), /nonce store/);
  assert.throws(() => createBayeServiceAuthenticator({
    services: serviceRegistry, nonceStore: { consume() {} }
  }), /required service scope/);
  assert.throws(() => createBayeServiceAuthenticator({
    services: { worker: { keys: { k: 'short' }, scopes: ['lifecycle:evidence:write'] } },
    nonceStore: { consume() {} }, requiredScope: 'lifecycle:evidence:write'
  }), /at least 32 bytes/);
});

test('middleware attaches only the verified service principal', async () => {
  const { authenticate } = setup();
  const middleware = requireBayeService(authenticate);
  const req = makeRequest();
  const res = {
    statusCode: 200, body: null,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; }
  };
  let nextCalled = false;
  await middleware(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
  assert.equal(req.bayeService.serviceId, 'lifecycle-producer');
});

test('middleware denies invalid requests without calling next', async () => {
  const { authenticate } = setup();
  const middleware = requireBayeService(authenticate);
  const req = makeRequest();
  req.rawBody = Buffer.from('tampered');
  const res = {
    statusCode: 200, body: null,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; }
  };
  let nextCalled = false;
  await middleware(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
});
