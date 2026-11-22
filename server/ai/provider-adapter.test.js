import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAIProviderChain, requestAICompletion, getAIProviderStatus } from './provider-adapter.js';

const primary = { key: 'primary-secret', endpoint: 'https://primary.example/v1', model: 'primary-model' };

test('provider chain includes fallback only when all fallback settings are explicit', () => {
  assert.equal(buildAIProviderChain(primary, { AI_FALLBACK_API_KEY: 'x' }).length, 1);
  assert.equal(buildAIProviderChain(primary, {
    AI_FALLBACK_API_KEY: 'fallback-secret',
    AI_FALLBACK_API_BASE_URL: 'https://fallback.example/v1',
    AI_FALLBACK_MODEL: 'fallback-model'
  }).length, 2);
});

test('uses fallback after primary failure and reports which provider answered', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url.startsWith('https://primary.example')) return { ok: false, status: 503 };
    return { ok: true, json: async () => ({ choices: [{ message: { content: 'réponse' }, finish_reason: 'stop' }] }) };
  };
  const result = await requestAICompletion({
    primary,
    env: {
      AI_FALLBACK_API_KEY: 'fallback-secret',
      AI_FALLBACK_API_BASE_URL: 'https://fallback.example/v1',
      AI_FALLBACK_MODEL: 'fallback-model'
    },
    messages: [{ role: 'user', content: 'test' }],
    fetchImpl
  });
  assert.deepEqual(calls, ['https://primary.example/v1/chat/completions', 'https://fallback.example/v1/chat/completions']);
  assert.equal(result.providerId, 'fallback');
  assert.equal(result.piece, 'réponse');
});

test('uses explicit fallback when primary returns an empty response', async () => {
  const calls = [];
  const result = await requestAICompletion({
    primary,
    env: {
      AI_FALLBACK_API_KEY: 'fallback-secret',
      AI_FALLBACK_API_BASE_URL: 'https://fallback.example/v1',
      AI_FALLBACK_MODEL: 'fallback-model'
    },
    messages: [],
    fetchImpl: async (url) => {
      calls.push(url);
      return url.startsWith('https://primary.example')
        ? { ok: true, json: async () => ({ choices: [{ message: { content: '   ' } }] }) }
        : { ok: true, json: async () => ({ choices: [{ message: { content: 'fallback response' } }] }) };
    }
  });
  assert.equal(calls.length, 2);
  assert.equal(result.providerId, 'fallback');
  assert.equal(result.piece, 'fallback response');
});

test('does not silently invent a fallback provider', async () => {
  let calls = 0;
  await assert.rejects(() => requestAICompletion({
    primary,
    env: {},
    messages: [],
    fetchImpl: async () => { calls++; return { ok: false, status: 503 }; }
  }), /All configured AI providers failed/);
  assert.equal(calls, 1);
});

test('provider failure summary contains status but never credentials', async () => {
  await assert.rejects(() => requestAICompletion({
    primary,
    env: {},
    messages: [],
    fetchImpl: async () => ({ ok: false, status: 401 })
  }), error => {
    assert.match(error.message, /primary:401/);
    assert.equal(error.message.includes('primary-secret'), false);
    return true;
  });
});

test('provider status exposes configuration booleans but no secrets', () => {
  const status = getAIProviderStatus({
    AI_API_KEY: 'secret',
    AI_FALLBACK_API_KEY: 'fallback-secret',
    AI_FALLBACK_API_BASE_URL: 'https://fallback.example/v1',
    AI_FALLBACK_MODEL: 'fallback-model'
  });
  assert.equal(status.primaryConfigured, true);
  assert.equal(status.fallbackConfigured, true);
  assert.equal(JSON.stringify(status).includes('secret'), false);
});
