import test from 'node:test';
import assert from 'node:assert/strict';
import {validatePublicImageUrl} from './image-url-validation.js';

test('accepts ordinary HTTPS DNS hostnames',()=>{
  for(const value of ['https://example.com/image.png','https://cdn.example.org/a.jpg','https://sub-domain.example.co.uk/path'])assert.equal(validatePublicImageUrl(value),true,value);
});

test('rejects insecure, local, IP, credential, port and malformed URLs',()=>{
  for(const value of [
    'http://example.com','https://localhost/a','https://x.local/a','https://x.internal/a',
    'https://127.0.0.1/a','https://192.168.1.2/a','https://[::1]/a','https://example.com:443/a',
    'https://example.com:8443/a','https://user:pass@example.com/a','not a URL','https://example.com\\n',
    'https://example.com/a'.repeat(300),'https://-bad.example/a','https://bad-.example/a',
    'https://a..example/a','https://example/a','https://foo_bar.example/a',
    'https://localhost.example/a','https://.example.com/a','https://example..com/a',
    'https://%65xample.com/a','ftp://example.com/a','https://example.com\\\\@127.0.0.1/a'
  ])assert.equal(validatePublicImageUrl(value),false,value);
});

test('rejects numeric and hexadecimal host representations',()=>{
  for(const value of ['https://2130706433/a','https://127.1/a','https://0x7f.0x0.0x0.0x1/a','https://0177.0.0.1/a','https://0x7f000001/a','https://4294967295/a'])assert.equal(validatePublicImageUrl(value),false,value);
});

test('accepts normalized trailing-dot public hostname',()=>{
  assert.equal(validatePublicImageUrl('https://example.com./image.png'),true);
});
