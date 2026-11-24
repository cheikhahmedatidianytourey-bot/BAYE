import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createHash, createHmac } from 'node:crypto';
import { createBayeServiceAuthenticator } from '../server/service-producer-auth.js';
import { createServiceAuthGatewayRouter } from '../server/service-auth-gateway.js';

const SECRET = 'test-only-service-signing-secret-at-least-32-bytes';
const NOW = 1_800_000_000_000;

async function startGateway({ authenticateServiceRequest }) {
  const app = express();
  app.use('/internal/service-auth', createServiceAuthGatewayRouter({ authenticateServiceRequest }));
  const server = createServer(app);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  return {
    url: `http://127.0.0.1:${address.port}/internal/service-auth/verify`,
    close: () => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  };
}

function signedHeaders({ body, nonce, target = '/internal/service-auth/verify', timestamp = String(NOW) }) {
  const serviceId = 'test-producer';
  const keyId = 'test-key';
  const digest = createHash('sha256').update(body).digest('hex');
  const canonical = ['POST', target, timestamp, nonce, digest, serviceId, keyId].join('\n');
  const signature = createHmac('sha256', SECRET).update(canonical).digest('hex');
  return {
    'content-type': 'application/json',
    'x-baye-service-id': serviceId,
    'x-baye-key-id': keyId,
    'x-baye-timestamp': timestamp,
    'x-baye-nonce': nonce,
    'x-baye-signature': signature
  };
}

function makeAuthenticator(consumed = new Set()) {
  return createBayeServiceAuthenticator({
    services: {
      'test-producer': {
        scopes: ['gateway:probe'],
        keys: { 'test-key': SECRET }
      }
    },
    nonceStore: {
      async consume({ nonce }) {
        if (consumed.has(nonce)) return false;
        consumed.add(nonce);
        return true;
      }
    },
    requiredScope: 'gateway:probe',
    now: () => NOW
  });
}

test('Gateway HTTP accepts an accurately signed raw JSON body and returns a bounded receipt', async t => {
  const gateway = await startGateway({ authenticateServiceRequest: makeAuthenticator() });
  t.after(() => gateway.close());
  const body = Buffer.from(JSON.stringify({ probe: 'gateway-http', version: 1 }));
  const response = await fetch(gateway.url, { method: 'POST', headers: signedHeaders({ body, nonce: 'nonce_http_probe_0001' }), body });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.authenticated, true);
  assert.equal(result.service.serviceId, 'test-producer');
  assert.equal(result.request.bodyBytes, body.length);
  assert.equal(result.effects.lifecycleEvidenceWritten, false);
  assert.equal(result.effects.externalActionPerformed, false);
});

test('Gateway HTTP rejects a replayed signed request', async t => {
  const gateway = await startGateway({ authenticateServiceRequest: makeAuthenticator() });
  t.after(() => gateway.close());
  const body = Buffer.from('{"probe":"replay"}');
  const headers = signedHeaders({ body, nonce: 'nonce_http_replay_0001' });
  const first = await fetch(gateway.url, { method: 'POST', headers, body });
  const second = await fetch(gateway.url, { method: 'POST', headers, body });
  assert.equal(first.status, 200);
  assert.equal(second.status, 401);
});

test('Gateway HTTP rejects a body modified after signing', async t => {
  const gateway = await startGateway({ authenticateServiceRequest: makeAuthenticator() });
  t.after(() => gateway.close());
  const signedBody = Buffer.from('{"probe":"original"}');
  const changedBody = Buffer.from('{"probe":"tampered"}');
  const response = await fetch(gateway.url, {
    method: 'POST',
    headers: signedHeaders({ body: signedBody, nonce: 'nonce_http_tamper_0001' }),
    body: changedBody
  });
  assert.equal(response.status, 401);
});

test('Gateway HTTP fails closed when service authentication is not configured', async t => {
  const gateway = await startGateway({ authenticateServiceRequest: null });
  t.after(() => gateway.close());
  const response = await fetch(gateway.url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.equal(response.status, 503);
});
