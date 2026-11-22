import test from 'node:test';
import assert from 'node:assert/strict';
import { readJsonLimited } from './bounded-json.js';

test('reads valid bounded JSON from a response stream', async () => {
  const response = new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json' } });
  assert.deepEqual(await readJsonLimited(response, 100), { ok: true });
});

test('rejects oversized declared responses before parsing', async () => {
  let cancelled = false;
  const response = {
    headers: { get: () => '101' },
    body: { cancel: async () => { cancelled = true; } },
    json: async () => { throw new Error('must not parse'); }
  };
  await assert.rejects(readJsonLimited(response, 100), /size limit/);
  assert.equal(cancelled, true);
});

test('rejects streamed responses exceeding the limit without content length', async () => {
  const response = new Response(new Uint8Array(1024));
  await assert.rejects(readJsonLimited(response, 100), /size limit/);
});

test('rejects invalid configured limits', async () => {
  await assert.rejects(readJsonLimited(new Response('{}'), 0), /maxBytes/);
});

test('refuses non-streaming JSON bodies to avoid unbounded parsing', async () => {
  let cancelled = false;
  const response = {
    headers: { get: () => null },
    body: { cancel: async () => { cancelled = true; } },
    json: async () => { throw new Error('must not parse'); }
  };
  await assert.rejects(readJsonLimited(response, 100), /stream is unavailable/);
  assert.equal(cancelled, true);
});
