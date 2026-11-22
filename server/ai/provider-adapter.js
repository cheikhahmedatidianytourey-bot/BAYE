import { readJsonLimited } from './bounded-json.js';
const MAX_PROVIDER_RESPONSE_BYTES = 5 * 1024 * 1024;

function normalizeEndpoint(value) {
  const raw = String(value || '').trim().replace(/\/$/, '');
  if (!raw) return '';
  return raw.endsWith('/chat/completions') ? raw : raw + '/chat/completions';
}

export function buildAIProviderChain(primary, env = process.env) {
  const chain = [];
  if (primary?.key && primary?.endpoint && primary?.model) {
    chain.push({ id: 'primary', key: primary.key, endpoint: normalizeEndpoint(primary.endpoint), model: primary.model });
  }
  // Failover is opt-in: no hidden provider, no surprise paid fallback.
  if (env.AI_FALLBACK_API_KEY && env.AI_FALLBACK_API_BASE_URL && env.AI_FALLBACK_MODEL) {
    chain.push({
      id: 'fallback',
      key: env.AI_FALLBACK_API_KEY,
      endpoint: normalizeEndpoint(env.AI_FALLBACK_API_BASE_URL),
      model: env.AI_FALLBACK_MODEL
    });
  }
  return chain;
}

function validateRequestOptions(messages, max_tokens, temperature, timeoutMs) {
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 100) {
    throw new Error('AI messages must be a non-empty array with at most 100 entries');
  }
  for (const message of messages) {
    if (!message || !['system', 'user', 'assistant'].includes(message.role) ||
        typeof message.content !== 'string' || message.content.length > 100000) {
      throw new Error('AI message format is invalid');
    }
  }
  if (!Number.isSafeInteger(max_tokens) || max_tokens < 1 || max_tokens > 100000) {
    throw new Error('AI max_tokens is outside the supported range');
  }
  if (typeof temperature !== 'number' || !Number.isFinite(temperature) || temperature < 0 || temperature > 2) {
    throw new Error('AI temperature is outside the supported range');
  }
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 180000) {
    throw new Error('AI timeout is outside the supported range');
  }
}

async function readProviderJsonLimited(response) {
  return readJsonLimited(response, MAX_PROVIDER_RESPONSE_BYTES);
}

export async function requestAICompletion({
  primary, env = process.env, messages, max_tokens = 4096, temperature = 0.4,
  fetchImpl = fetch, timeoutMs = 90000
}) {
  validateRequestOptions(messages, max_tokens, temperature, timeoutMs);
  const providers = buildAIProviderChain(primary, env);
  if (!providers.length) throw new Error('AI provider is not configured');
  const failures = [];
  for (const provider of providers) {
    try {
      const response = await fetchImpl(provider.endpoint, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + provider.key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: provider.model, messages, max_tokens, temperature }),
        signal: AbortSignal.timeout(timeoutMs)
      });
      if (!response.ok) {
        failures.push({ provider: provider.id, status: response.status });
        continue;
      }
      const declaredLength = Number(response.headers?.get?.('content-length'));
      if (Number.isFinite(declaredLength) && declaredLength > MAX_PROVIDER_RESPONSE_BYTES) {
        failures.push({ provider: provider.id, status: 'response_too_large' });
        continue;
      }
      const data = await readProviderJsonLimited(response);
      const choice = data?.choices?.[0];
      const piece = choice?.message?.content;
      if (typeof piece !== 'string' || !piece.trim()) {
        failures.push({ provider: provider.id, status: 'empty_response' });
        continue;
      }
      return { piece, finishReason: choice.finish_reason || 'stop', providerId: provider.id, model: provider.model };
    } catch (_error) {
      failures.push({ provider: provider.id, status: 'unavailable' });
    }
  }
  const summary = failures.map(item => item.provider + ':' + item.status).join(',');
  throw new Error('All configured AI providers failed (' + summary + ')');
}

export function getAIProviderStatus(env = process.env) {
  return {
    primaryConfigured: Boolean(env.AI_API_KEY),
    fallbackConfigured: Boolean(env.AI_FALLBACK_API_KEY && env.AI_FALLBACK_API_BASE_URL && env.AI_FALLBACK_MODEL),
    fallbackPolicy: 'explicit_opt_in_only'
  };
}
