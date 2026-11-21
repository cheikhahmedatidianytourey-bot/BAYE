'use strict';

/**
 * BAYE infrastructure monitor v1.
 * Checks configured endpoints only; it does NOT perform destructive remediation.
 * Alerts are emitted through the caller; monitoring results must be persisted externally.
 */
const DEFAULT_TIMEOUT_MS = 8000;

async function checkEndpoint(url, timeoutMs = DEFAULT_TIMEOUT_MS) {
  if (!url || typeof url !== 'string') {
    return { ok: false, status: null, latencyMs: null, error: 'Endpoint not configured' };
  }
  const started = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { method: 'GET', signal: controller.signal });
    return {
      ok: response.ok,
      status: response.status,
      latencyMs: Date.now() - started,
      error: response.ok ? null : 'Non-success HTTP response'
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      latencyMs: Date.now() - started,
      error: error?.name === 'AbortError' ? 'Timeout' : 'Endpoint unreachable'
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function runMonitor() {
  const endpoints = [
    { name: 'backend-health', url: process.env.BAYE_BACKEND_HEALTH_URL || 'https://baye-ai-gateway.onrender.com/health' },
    { name: 'frontend', url: process.env.BAYE_FRONTEND_URL || 'https://baye-app.onrender.com' }
  ];
  const results = await Promise.all(endpoints.map(async item => ({
    name: item.name,
    ...(await checkEndpoint(item.url))
  })));
  return {
    checkedAt: new Date().toISOString(),
    overallOk: results.every(r => r.ok),
    results
  };
}

export { checkEndpoint, runMonitor };
