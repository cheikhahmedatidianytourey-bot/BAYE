import test from 'node:test';
import assert from 'node:assert/strict';
import { routeBayeDomain, buildDomainSystemPrompt, getBayeCapabilityCatalog } from './domain-router.js';

test('routes advanced mathematical questions to mathematics', () => {
  const route = routeBayeDomain('Démontre ce théorème avec une intégrale et une dérivée');
  assert.equal(route.domain, 'mathematics');
  assert.notEqual(route.confidence, 'fallback');
});

test('routes code tasks to computer science', () => {
  assert.equal(routeBayeDomain('Écris une API en JavaScript avec des tests').domain, 'computer_science');
});

test('routes medical questions with explicit safety framing', () => {
  const built = buildDomainSystemPrompt('Question', 'Quels symptômes nécessitent une consultation médicale ?');
  assert.equal(built.route.domain, 'medicine');
  assert.match(built.systemPrompt, /jamais diagnostic certain/i);
});

test('falls back transparently when no specialist keywords match', () => {
  const route = routeBayeDomain('Bonjour, raconte-moi une anecdote.');
  assert.equal(route.domain, 'general');
  assert.equal(route.confidence, 'fallback');
});

test('capability catalog does not overstate unavailable systems', () => {
  const catalog = getBayeCapabilityCatalog();
  assert.equal(catalog.runtime.formalProofVerification, false);
  assert.equal(catalog.runtime.independentMultiModelConsensus, false);
  assert.equal(catalog.runtime.mediaProviders.image, 'cloudflare_workers_ai');
  assert.equal(catalog.runtime.mediaProviders.video, 'external_fal_adapter');
  assert.ok(catalog.domains.length >= 15);
});

test('detects relevant secondary disciplines for multidisciplinary requests', () => {
  const route = routeBayeDomain('Conçois un robot médical avec une API Python et analyse des symptômes');
  assert.equal(route.domain, 'computer_science');
  assert.ok(route.disciplines.some(item => item.id === 'engineering'));
  assert.ok(route.disciplines.some(item => item.id === 'medicine'));
  assert.equal(route.multiDomain, true);
});

test('multidisciplinary prompt includes selected specialist methods', () => {
  const built = buildDomainSystemPrompt('Projet', 'Créer un robot médical avec programmation Python');
  assert.ok(built.route.disciplines.length > 1);
  assert.match(built.systemPrompt, /MÉTHODE INFORMATIQUE/);
  assert.match(built.systemPrompt, /MÉTHODE INGÉNIERIE/);
});
