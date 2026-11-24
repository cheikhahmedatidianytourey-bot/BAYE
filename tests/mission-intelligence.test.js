import test from 'node:test';
import assert from 'node:assert/strict';
import { buildIntelligentMissionPlan } from '../server/mission-intelligence.js';

function plannerResponse(tasks, extra = {}) {
  return { piece: JSON.stringify({ tasks, ...extra }), model: 'test-planner' };
}

test('Mission Intelligence returns a bounded plan and never starts execution', async () => {
  const result = await buildIntelligentMissionPlan({
    mission: 'Concevoir une application de suivi scolaire sécurisée.',
    complete: async () => plannerResponse([
      { id: 'requirements', role: 'research', objective: 'Identifier les besoins et contraintes.' },
      { id: 'architecture', role: 'engineering', objective: 'Proposer une architecture sécurisée.', dependsOn: ['requirements'] },
      { id: 'review', role: 'security', objective: 'Examiner les risques.', dependsOn: ['architecture'] }
    ])
  });

  assert.equal(result.engine, 'BAYE Mission Intelligence');
  assert.equal(result.version, '7.0.0');
  assert.equal(result.status, 'plan_ready_for_review');
  assert.equal(result.graph.status, 'validated');
  assert.equal(result.graph.mode, 'plan_only');
  assert.equal(result.graph.tasks.length, 3);
  assert.equal(result.approval.required, true);
  assert.equal(result.approval.approved, false);
  assert.equal(result.approval.executionStarted, false);
  assert.equal(result.safety.toolsInvoked, 0);
  assert.equal(result.safety.externalActions, false);
  assert.equal(result.model, 'test-planner');
});

test('Mission Intelligence rejects malformed JSON', async () => {
  await assert.rejects(
    () => buildIntelligentMissionPlan({ mission: 'Planifier un projet.', complete: async () => ({ piece: '{not-json' }) }),
    /JSON strictement valide/
  );
});

test('Mission Intelligence rejects additional top-level fields', async () => {
  await assert.rejects(
    () => buildIntelligentMissionPlan({
      mission: 'Planifier un projet.',
      complete: async () => plannerResponse([{ id: 'a', role: 'research', objective: 'Analyser.' }], { execute: true })
    }),
    /uniquement un objet contenant tasks/
  );
});

test('Mission Intelligence rejects unsupported task fields', async () => {
  await assert.rejects(
    () => buildIntelligentMissionPlan({
      mission: 'Planifier un projet.',
      complete: async () => plannerResponse([{ id: 'a', role: 'research', objective: 'Analyser.', command: 'run' }])
    }),
    /champs non autorisés/
  );
});

test('Mission Intelligence rejects unknown specialist roles', async () => {
  await assert.rejects(
    () => buildIntelligentMissionPlan({
      mission: 'Planifier un projet.',
      complete: async () => plannerResponse([{ id: 'a', role: 'administrator', objective: 'Administrer.' }])
    }),
    /Rôle non autorisé/
  );
});

test('Mission Intelligence rejects cyclic task dependencies', async () => {
  await assert.rejects(
    () => buildIntelligentMissionPlan({
      mission: 'Planifier un projet.',
      complete: async () => plannerResponse([
        { id: 'a', role: 'research', objective: 'Étudier A.', dependsOn: ['b'] },
        { id: 'b', role: 'quality', objective: 'Étudier B.', dependsOn: ['a'] }
      ])
    }),
    /Cycle détecté/
  );
});

test('Mission Intelligence rejects plans exceeding task limits', async () => {
  await assert.rejects(
    () => buildIntelligentMissionPlan({
      mission: 'Planifier un projet.',
      complete: async () => plannerResponse(Array.from({ length: 6 }, (_, index) => ({
        id: 'task_' + index, role: 'research', objective: 'Étudier le sujet.'
      })))
    }),
    /1 à 5 tâches/
  );
});

test('Mission Intelligence rejects invalid or oversized objectives before model invocation', async () => {
  let called = false;
  const complete = async () => { called = true; return plannerResponse([]); };
  await assert.rejects(() => buildIntelligentMissionPlan({ mission: '  ', complete }), /1 et 4 000 caractères/);
  await assert.rejects(() => buildIntelligentMissionPlan({ mission: 'x'.repeat(4001), complete }), /1 et 4 000 caractères/);
  assert.equal(called, false);
});

test('Mission Intelligence rejects null dependency lists and non-positive budgets', async () => {
  await assert.rejects(
    () => buildIntelligentMissionPlan({
      mission: 'Planifier un projet.',
      complete: async () => plannerResponse([{ id: 'a', role: 'research', objective: 'Analyser.', dependsOn: null }])
    }),
    /dépendances doit être un tableau/
  );
  await assert.rejects(
    () => buildIntelligentMissionPlan({
      mission: 'Planifier un projet.',
      complete: async () => plannerResponse([{ id: 'a', role: 'research', objective: 'Analyser.', budget: 0 }])
    }),
    /budget de chaque tâche/
  );
});
