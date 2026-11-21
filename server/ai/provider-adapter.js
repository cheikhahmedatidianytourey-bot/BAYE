function normalizeEndpoint(value) {
  const raw = String(value || '').trim().replace(/\\/$/, '');
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

export async function requestAICompletion({
  primary, env = process.env, messages, max_tokens = 4096, temperature = 0.4,
  fetchImpl = fetch, timeoutMs = 90000
}) {
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
      const data = await response.json();
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
