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
    messages: [{ role: 'user', content: 'test' }],
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
    messages: [{ role: 'user', content: 'test' }],
    fetchImpl: async () => { calls++; return { ok: false, status: 503 }; }
  }), /All configured AI providers failed/);
  assert.equal(calls, 1);
});

test('provider failure summary contains status but never credentials', async () => {
  await assert.rejects(() => requestAICompletion({
    primary,
    env: {},
    messages: [{ role: 'user', content: 'test' }],
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


test('malformed provider JSON triggers explicit fallback rather than crashing', async () => {
  const result = await requestAICompletion({
    primary,
    env: {
      AI_FALLBACK_API_KEY: 'fallback-secret',
      AI_FALLBACK_API_BASE_URL: 'https://fallback.example/v1',
      AI_FALLBACK_MODEL: 'fallback-model'
    },
    messages: [{ role: 'user', content: 'test' }],
    fetchImpl: async (url) => url.startsWith('https://primary.example')
      ? { ok: true, json: async () => { throw new Error('malformed'); } }
      : { ok: true, json: async () => ({ choices: [{ message: { content: 'safe fallback' } }] }) }
  });
  assert.equal(result.providerId, 'fallback');
  assert.equal(result.piece, 'safe fallback');
});

test('timeout or network exception falls through only to explicitly configured provider', async () => {
  let calls = 0;
  const result = await requestAICompletion({
    primary,
    env: {
      AI_FALLBACK_API_KEY: 'fallback-secret',
      AI_FALLBACK_API_BASE_URL: 'https://fallback.example/v1',
      AI_FALLBACK_MODEL: 'fallback-model'
    },
    messages: [{ role: 'user', content: 'test' }],
    fetchImpl: async (url) => {
      calls++;
      if (url.startsWith('https://primary.example')) throw new Error('timeout');
      return { ok: true, json: async () => ({ choices: [{ message: { content: 'ok' } }] }) };
    }
  });
  assert.equal(calls, 2);
  assert.equal(result.providerId, 'fallback');
});

test('rejects invalid message payloads and out-of-range request options before network access', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; };
  await assert.rejects(() => requestAICompletion({ primary, messages: [], fetchImpl }), /messages/);
  await assert.rejects(() => requestAICompletion({ primary, messages: [{ role: 'user', content: 'ok' }], max_tokens: 0, fetchImpl }), /max_tokens/);
  await assert.rejects(() => requestAICompletion({ primary, messages: [{ role: 'user', content: 'ok' }], temperature: 3, fetchImpl }), /temperature/);
  await assert.rejects(() => requestAICompletion({ primary, messages: [{ role: 'user', content: 'ok' }], timeoutMs: 500, fetchImpl }), /timeout/);
  assert.equal(calls, 0);
});
\n\ntest('rejects oversized declared provider response and tries configured fallback', async () => {\n  const result = await requestAICompletion({\n    primary,\n    env: { AI_FALLBACK_API_KEY: 'fallback-secret', AI_FALLBACK_API_BASE_URL: 'https://fallback.example/v1', AI_FALLBACK_MODEL: 'fallback-model' },\n    messages: [{ role: 'user', content: 'test' }],\n    fetchImpl: async (url) => url.startsWith('https://primary.example')\n      ? { ok: true, headers: { get: () => String(6 * 1024 * 1024) }, json: async () => { throw new Error('should not parse oversized response'); } }\n      : { ok: true, json: async () => ({ choices: [{ message: { content: 'fallback safe' } }] }) }\n  });\n  assert.equal(result.providerId, 'fallback');\n  assert.equal(result.piece, 'fallback safe');\n});\n