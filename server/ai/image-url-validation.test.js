import test from 'node:test';
import assert from 'node:assert/strict';
import {validatePublicImageUrl} from './image-url-validation.js';

test('accepts HTTPS hostnames and rejects local, IP, port, credential and malformed URLs',()=>{
  for(const value of ['https://example.com/image.png','https://cdn.example.org/a.jpg'])assert.equal(validatePublicImageUrl(value),true);
  for(const value of ['http://example.com','https://localhost/a','https://x.local/a','https://127.0.0.1/a','https://192.168.1.2/a','https://[::1]/a','https://example.com:443/a','https://user:pass@example.com/a','not a URL','https://example.com\n','https://example.com/a'.repeat(300)])assert.equal(validatePublicImageUrl(value),false);
});
