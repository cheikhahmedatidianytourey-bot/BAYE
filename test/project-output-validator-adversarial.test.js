import test from 'node:test';
import assert from 'node:assert/strict';
import { validateProjectFiles } from '../server/project-output-validator.js';

// G44 adversarial validator suite: boundaries, malformed manifests, path safety,
// and size accounting. These are validator-level tests, not sandbox execution.
const valid = [{ path: 'package.json', content: '{}' }, { path: 'src/main.js', content: 'export{}' }];

test('accepts a valid manifest at an explicitly configured file-count boundary', () => {
  const result = validateProjectFiles(valid, { maxFiles: 2 });
  assert.equal(result.passed, true);
  assert.equal(result.filesChecked, 2);
});

test('rejects a manifest exceeding the file-count limit', () => {
  const result = validateProjectFiles([...valid, { path: 'extra.js', content: '' }], { maxFiles: 2 });
  assert.ok(result.issues.some(issue => issue.code === 'TOO_MANY_FILES'));
});

test('rejects an empty manifest', () => {
  const result = validateProjectFiles([]);
  assert.ok(result.issues.some(issue => issue.code === 'EMPTY_PROJECT'));
});

test('rejects non-array input without throwing', () => {
  for (const input of [null, undefined, {}, 'files', 42]) {
    const result = validateProjectFiles(input);
    assert.equal(result.passed, false);
    assert.ok(result.issues.some(issue => issue.code === 'FILES_NOT_ARRAY'));
  }
});

test('rejects null and primitive file entries safely', () => {
  const result = validateProjectFiles([null, 7, 'x']);
  assert.ok(result.issues.some(issue => issue.code === 'INVALID_FILE_ENTRY'));
});

test('rejects blank, missing, and non-string paths', () => {
  const result = validateProjectFiles([{ content: 'x' }, { path: '', content: 'x' }, { path: 8, content: 'x' }, { path: '   ', content: 'x' }]);
  assert.ok(result.issues.some(issue => issue.code === 'INVALID_PATH'));
});

test('detects traversal, absolute paths, dot components and empty components', () => {
  const paths = ['../escape.js', 'src/../../escape', '/absolute.js', 'src/./file.js', 'src//file.js', 'src/'];
  const result = validateProjectFiles(paths.map(path => ({ path, content: 'x' })));
  assert.ok(result.issues.filter(issue => issue.code === 'UNSAFE_PATH').length >= paths.length);
});

test('rejects backslash paths including Windows-style traversal', () => {
  const result = validateProjectFiles([{ path: '..\\outside.js', content: 'x' }, { path: 'src\\file.js', content: 'x' }]);
  assert.equal(result.issues.filter(issue => issue.code === 'UNSAFE_PATH').length, 2);
});

test('reports duplicate paths even when duplicate content differs', () => {
  const result = validateProjectFiles([{ path: 'src/a.js', content: 'a' }, { path: 'src/a.js', content: 'b' }]);
  assert.ok(result.issues.some(issue => issue.code === 'DUPLICATE_PATH'));
});

test('rejects content that is not a string and continues scanning', () => {
  const result = validateProjectFiles([{ path: 'src/a.js', content: null }, { path: 'src/b.js', content: 1 }]);
  assert.ok(result.issues.filter(issue => issue.code === 'CONTENT_NOT_STRING').length === 2);
});

test('accounts for UTF-8 byte length rather than character count', () => {
  const result = validateProjectFiles([{ path: 'unicode.txt', content: 'é🙂' }], { maxTotalBytes: 6 });
  assert.equal(result.totalBytes, Buffer.byteLength('é🙂', 'utf8'));
  assert.equal(result.passed, true);
});

test('rejects aggregate UTF-8 size over the configured cap', () => {
  const result = validateProjectFiles([{ path: 'a.txt', content: '12345' }, { path: 'b.txt', content: '67890' }], { maxTotalBytes: 9 });
  assert.ok(result.issues.some(issue => issue.code === 'TOTAL_SIZE_EXCEEDED'));
});

test('accepts aggregate size exactly at the configured cap', () => {
  const result = validateProjectFiles([{ path: 'a.txt', content: '12345' }], { maxTotalBytes: 5 });
  assert.equal(result.passed, true);
  assert.equal(result.totalBytes, 5);
});

test('enforces configurable path-length limits', () => {
  const result = validateProjectFiles([{ path: 'a'.repeat(12), content: 'x' }], { maxPathLength: 10 });
  assert.ok(result.issues.some(issue => issue.code === 'PATH_TOO_LONG'));
});

test('does not throw when several adversarial defects coexist', () => {
  const result = validateProjectFiles([null, { path: '../bad', content: 3 }, { path: '../bad', content: 'x' }, { path: 'ok.txt', content: 'x'.repeat(20) }], { maxTotalBytes: 5 });
  assert.equal(result.passed, false);
  assert.ok(result.issues.length >= 4);
});
