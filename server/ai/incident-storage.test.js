import test from 'node:test';import assert from 'node:assert/strict';import {persistentIncidentStorageReady,getIncidentStorageStatus} from './incident-storage.js';
test('G72 reports volatile/unconfigured storage when DB is absent',()=>{if(!process.env.DATABASE_URL){assert.equal(persistentIncidentStorageReady(),false);assert.equal(getIncidentStorageStatus().persistent,false);}});
