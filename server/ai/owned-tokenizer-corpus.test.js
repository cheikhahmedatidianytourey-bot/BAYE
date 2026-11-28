import test from 'node:test';
import assert from 'node:assert/strict';
import {tokenizeOwnedText,prepareOwnedCorpus,buildOwnedVocabulary} from './owned-tokenizer-corpus.js';
test('tokenizer is Unicode-aware, normalized and deterministic',()=>{assert.deepEqual(tokenizeOwnedText('ÉCOLE café 42').tokens,['école','café','42']);assert.deepEqual(tokenizeOwnedText('Straße').tokens,tokenizeOwnedText('Straße').tokens);});
test('tokenizer rejects invalid and oversized input',()=>{assert.equal(tokenizeOwnedText(null).status,'rejected');assert.equal(tokenizeOwnedText('x'.repeat(10001)).status,'rejected');});
test('corpus prep returns normalized records and sorted vocabulary',()=>{const c=prepareOwnedCorpus([{text:'Banana apple',label:'food'},{text:'Apple pear',label:'fruit'}]);assert.equal(c.status,'ok');assert.deepEqual(c.vocabulary,['apple','banana','pear']);assert.equal(c.stats.records,2);});
test('corpus validates limits and records',()=>{assert.equal(prepareOwnedCorpus([]).status,'rejected');assert.equal(prepareOwnedCorpus([{text:''}]).status,'rejected');assert.equal(prepareOwnedCorpus(Array(1001).fill({text:'x'})).status,'rejected');});
test('vocabulary package includes checksum and stable vocabulary',()=>{const c=prepareOwnedCorpus([{text:'zeta alpha'}]);const v=buildOwnedVocabulary(c);assert.equal(v.status,'ok');assert.deepEqual(v.vocabulary,['alpha','zeta']);assert.equal(v.checksum.length,64);});
