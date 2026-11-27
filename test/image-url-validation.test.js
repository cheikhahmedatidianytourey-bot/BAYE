import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePublicImageUrl } from '../server/ai/image-url-validation.js';

const publicResolver=async()=>['93.184.216.34'];
const blockedResolver=async()=>['127.0.0.1'];
test('accepts HTTPS DNS host resolving to public address',async()=>assert.equal(await validatePublicImageUrl('https://example.org/image.png',{resolver:publicResolver}),true));
test('rejects HTTP, credentials, explicit port and malformed input',async()=>{
 for(const url of ['http://example.org/a','https://user:pass@example.org/a','https://example.org:443/a','bad url',''])assert.equal(await validatePublicImageUrl(url,{resolver:publicResolver}),false);
});
test('rejects localhost and private resolved addresses',async()=>{
 assert.equal(await validatePublicImageUrl('https://localhost/a',{resolver:publicResolver}),false);
 assert.equal(await validatePublicImageUrl('https://example.org/a',{resolver:blockedResolver}),false);
});
test('rejects local IP and numeric/hex host tricks',async()=>{
 for(const url of ['https://127.0.0.1/a','https://10.0.0.1/a','https://2130706433/a','https://0x7f000001/a'])assert.equal(await validatePublicImageUrl(url,{resolver:publicResolver}),false);
});
test('rejects URLs containing whitespace or excessive length',async()=>{
 assert.equal(await validatePublicImageUrl('https://example.org/a b',{resolver:publicResolver}),false);
 assert.equal(await validatePublicImageUrl('https://example.org/'+'x'.repeat(2050),{resolver:publicResolver}),false);
});
