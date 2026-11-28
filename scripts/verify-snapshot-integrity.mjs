import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const manifestPath = path.join(root, 'server/ai/snapshot-integrity-manifest.json');
const expectedFiles = [
  'package.json',
  'server/ai/render-sandbox-adapter.js',
  'server/ai/controlled-repair-gate.js',
  'server/ai/repair-sandbox-runner.js',
  'scripts/verify-snapshot-integrity.mjs'
];

function fail(message) {
  process.stderr.write('BAYE snapshot integrity verification failed: ' + message + '\n');
  process.exitCode = 1;
}

function isRegularInTreeFile(relative) {
  const absolute = path.join(root, relative);
  try {
    const stat = fs.lstatSync(absolute);
    return stat.isFile() && fs.realpathSync(absolute) === absolute;
  } catch {
    return false;
  }
}

let manifest;
try {
  if (!isRegularInTreeFile('server/ai/snapshot-integrity-manifest.json')) {
    throw new Error('manifest is not a regular file inside the repository');
  }
  manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
} catch (error) {
  fail(error.message);
}

if (process.exitCode !== 1) {
  if (manifest.schemaVersion !== 1 || manifest.algorithm !== 'sha256' || !Array.isArray(manifest.files)) {
    fail('unsupported manifest schema');
  } else {
    const paths = manifest.files.map(item => item?.path);
    if (paths.length !== expectedFiles.length ||
        expectedFiles.some(file => !paths.includes(file)) ||
        new Set(paths).size !== paths.length) {
      fail('manifest must contain exactly the approved critical file set');
    } else {
      for (const item of manifest.files) {
        if (!isRegularInTreeFile(item.path) || !/^[a-f0-9]{64}$/.test(item.sha256 || '')) {
          fail('invalid file or SHA-256 entry: ' + item.path);
          break;
        }
        const actual = createHash('sha256')
          .update(fs.readFileSync(path.join(root, item.path)))
          .digest('hex');
        if (actual !== item.sha256) {
          fail('SHA-256 mismatch: ' + item.path);
          break;
        }
      }
    }
  }
}

if (process.exitCode !== 1) {
  process.stdout.write('BAYE snapshot integrity manifest verified (' + manifest.files.length + ' critical files)\n');
}
