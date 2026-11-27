import test from 'node:test';
import assert from 'node:assert/strict';
import { validateProjectFiles } from '../server/project-output-validator.js';

// Test-only integrity audit over synthetic generated-project manifests.
// This is a test contract, not a production BAYE feature or real execution.
function audit(files) {
  const structural = validateProjectFiles(files);
  const issues = [...structural.issues];
  const byPath = new Map(files.filter(f => f && typeof f.path === 'string').map(f => [f.path, f]));
  const pkgFile = byPath.get('package.json');
  let pkg = null;
  if (!pkgFile) issues.push({ code: 'PACKAGE_JSON_REQUIRED' });
  else {
    try { pkg = JSON.parse(pkgFile.content); }
    catch { issues.push({ code: 'PACKAGE_JSON_INVALID' }); }
  }
  if (pkg && typeof pkg === 'object' && !Array.isArray(pkg)) {
    if (!pkg.scripts || typeof pkg.scripts.build !== 'string' || !pkg.scripts.build.trim()) issues.push({ code: 'BUILD_SCRIPT_MISSING' });
    if (!pkg.scripts || typeof pkg.scripts.test !== 'string' || !pkg.scripts.test.trim()) issues.push({ code: 'TEST_SCRIPT_MISSING' });
    const declared = new Set([...Object.keys(pkg.dependencies || {}), ...Object.keys(pkg.devDependencies || {})]);
    for (const file of files) {
      if (!file || typeof file.content !== 'string' || !/\\.(?:js|jsx|ts|tsx|mjs|cjs)$/.test(file.path)) continue;
      const imports = [...file.content.matchAll(/(?:from\\s*|import\\s*)['"]([^'"]+)['"]|require\\(['"]([^'"]+)['"]\\)/g)].map(m => m[1] || m[2]);
      for (const spec of imports) {
        if (spec.startsWith('.')) {
          const target = spec.replace(/^\\.\\//, '');
          const parent = file.path.split('/').slice(0, -1).join('/');
          const candidates = [parent ? parent + '/' + target : target, target + '.js', target + '.ts', target + '.jsx', target + '.tsx', target + '/index.js'];
          if (!candidates.some(p => byPath.has(p))) issues.push({ code: 'LOCAL_IMPORT_MISSING', file: file.path, import: spec });
        } else {
          const root = spec.split('/')[0];
          const packageName = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : root;
          if (!['node:'].some(prefix => spec.startsWith(prefix)) && !declared.has(packageName)) issues.push({ code: 'DEPENDENCY_UNDECLARED', file: file.path, dependency: packageName });
        }
      }
    }
  }
  const entrypoint = ['src/main.js', 'src/index.js', 'index.js', 'main.js'].some(p => byPath.has(p));
  if (!entrypoint) issues.push({ code: 'ENTRYPOINT_MISSING' });
  return { passed: structural.passed && issues.length === 0, issues };
}

const fixture = [
  { path: 'package.json', content: JSON.stringify({ dependencies: { lodash: '^4.0.0' }, scripts: { build: 'vite build', test: 'node --test' } }) },
  { path: 'README.md', content: '# Fixture' },
  { path: 'src/main.js', content: "import { helper } from './helper.js';\\nimport lodash from 'lodash';\\nexport const value = helper(lodash);" },
  { path: 'src/helper.js', content: 'export function helper(value) { return value; }' }
];

test('accepts a synthetic multi-file project with consistent manifest and imports', () => {
  assert.equal(audit(fixture).passed, true);
});

test('reports missing package manifest', () => {
  const result = audit(fixture.filter(f => f.path !== 'package.json'));
  assert.ok(result.issues.some(i => i.code === 'PACKAGE_JSON_REQUIRED'));
});

test('reports malformed package metadata', () => {
  const files = fixture.map(f => f.path === 'package.json' ? { ...f, content: '{broken' } : f);
  assert.ok(audit(files).issues.some(i => i.code === 'PACKAGE_JSON_INVALID'));
});

test('reports absent build and test scripts', () => {
  const files = fixture.map(f => f.path === 'package.json' ? { ...f, content: JSON.stringify({}) } : f);
  const codes = audit(files).issues.map(i => i.code);
  assert.ok(codes.includes('BUILD_SCRIPT_MISSING'));
  assert.ok(codes.includes('TEST_SCRIPT_MISSING'));
});

test('reports an undeclared imported dependency', () => {
  const files = fixture.map(f => f.path === 'src/main.js' ? { ...f, content: "import mystery from 'mystery-package';\\nexport default mystery;" } : f);
  assert.ok(audit(files).issues.some(i => i.code === 'DEPENDENCY_UNDECLARED' && i.dependency === 'mystery-package'));
});

test('reports a missing local import target', () => {
  const files = fixture.map(f => f.path === 'src/main.js' ? { ...f, content: "import missing from './missing.js';\\nexport default missing;" } : f);
  assert.ok(audit(files).issues.some(i => i.code === 'LOCAL_IMPORT_MISSING'));
});

test('reports missing entrypoint', () => {
  const files = fixture.filter(f => f.path !== 'src/main.js');
  assert.ok(audit(files).issues.some(i => i.code === 'ENTRYPOINT_MISSING'));
});

test('retains structural path-safety issues in audit result', () => {
  const files = [...fixture, { path: '../unsafe.js', content: 'x' }];
  assert.ok(audit(files).issues.some(i => i.code === 'UNSAFE_PATH'));
});
