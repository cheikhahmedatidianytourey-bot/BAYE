import test from 'node:test';
import assert from 'node:assert/strict';
import { hashAccountToken } from '../server/persistent-usage.js';
test('token hashing is deterministic and does not expose plaintext',()=>{
 const token='a'.repeat(48),digest=hashAccountToken(token);
 assert.equal(digest,hashAccountToken(token));
 assert.notEqual(digest,token);
 assert.match(digest,/^[a-f0-9]{64}$/);
});
test('rejects short and malformed tokens',()=>{
 assert.throws(()=>hashAccountToken('short'),/INVALID_ACCOUNT_TOKEN/);
 assert.throws(()=>hashAccountToken(null),/INVALID_ACCOUNT_TOKEN/);
});
