import test from 'node:test';
import assert from 'node:assert/strict';
import { persistentIncidentStorageReady, getIncidentStorageStatus } from './incident-storage.js';

test('G72 reports unconfigured storage when DB is absent', async () => {
  if (!process.env.DATABASE_URL) {
    assert.equal(persistentIncidentStorageReady(), false);
    const status = await getIncidentStorageStatus();
    assert.equal(status.persistent, false);
    assert.equal(status.initialized, false);
  }
});
