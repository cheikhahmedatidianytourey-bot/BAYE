import test from 'node:test';
import assert from 'node:assert/strict';
import { validateProjectFiles } from '../server/project-output-validator.js';

// G45 boundary interactions: ensure structural validation issues remain visible
// when a manifest is incomplete or internally contradictory.
const minimal = [
  { path: 'package.json', content: '{}' },
  { path: 'src/main.js', content: 'export const ready = true;' }
];

test('reports structural defects while retaining scan results for other files', () => {
  const result = validateProjectFiles([
    { path: '../escape.js', content: 'unsafe' },
    { path: 'src/valid.js', content: 'export{}' },
    { path: 'src/valid.js', content: 'duplicate' }
  ]);
  assert.equal(result.passed, false);
  assert.ok(result.issues.some(i => i.code === 'UNSAFE_PATH'));
  assert.ok(result.issues.some(i => i.code === 'DUPLICATE_PATH'));
});

test('validates a manifest and file content as separate defect dimensions', () => {
  const result = validateProjectFiles([
    { path: 'package.json', content: '{}' },
    { path: 'src/main.js', content: null },
    { path: 'src/other.js', content: 'valid' }
  ]);
  assert.equal(result.passed, false);
  assert.ok(result.issues.some(i => i.code === 'CONTENT_NOT_STRING'));
});

test('a valid project manifest remains accepted when an optional file is added', () => {
  const result = validateProjectFiles([...minimal, { path: 'README.md', content: '# project' }]);
  assert.equal(result.passed, true);
  assert.equal(result.filesChecked, 3);
});

test('aggregates independent limits without accepting a project that exceeds either', () => {
  const result = validateProjectFiles([
    { path: 'a.txt', content: '1234' },
    { path: 'b.txt', content: '5678' }
  ], { maxFiles: 1, maxTotalBytes: 7 });
  assert.equal(result.passed, false);
  assert.ok(result.issues.some(i => i.code === 'TOO_MANY_FILES'));
  assert.ok(result.issues.some(i => i.code === 'TOTAL_SIZE_EXCEEDED'));
});
