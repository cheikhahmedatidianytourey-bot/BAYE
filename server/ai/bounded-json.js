export async function readJsonLimited(response, maxBytes = 5 * 1024 * 1024) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new TypeError('maxBytes must be a positive safe integer');
  const declared = Number(response.headers?.get?.('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await response.body?.cancel?.().catch(() => {});
    throw new Error('Response exceeds the configured size limit');
  }
  if (!response.body?.getReader) {
    // Compatibility for test doubles / custom adapters: measure serialized JSON before use.
    if (typeof response.json !== 'function') {
      await response.body?.cancel?.().catch(() => {});
      throw new Error('Response stream is unavailable; refusing an unbounded JSON read');
    }
    const data = await response.json();
    const bytes = new TextEncoder().encode(JSON.stringify(data)).byteLength;
    if (bytes > maxBytes) throw new Error('Response exceeds the configured size limit');
    return data;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new Error('Response exceeds the configured size limit');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(bytes));
}
