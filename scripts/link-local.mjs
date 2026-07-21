#!/usr/bin/env node
/**
 * Prepare the publishable engine package for local npm linking.
 * Does not change package.json / lockfile of consumers.
 *
 * Usage (from repo root):
 *   node scripts/link-local.mjs
 *   node scripts/link-local.mjs --consumer ../astrevno
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const enginePkg = path.join(root, 'packages', 'engine');

function run(cmd, args, cwd) {
  const result = spawnSync(cmd, args, {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run('npm', ['run', 'build', '-w', 'grani-tag-engine'], root);
run('npm', ['link', '--no-save'], enginePkg);

const consumerFlag = process.argv.indexOf('--consumer');
if (consumerFlag !== -1) {
  const consumer = process.argv[consumerFlag + 1];
  if (!consumer) {
    console.error('Missing path after --consumer');
    process.exit(1);
  }
  const consumerPath = path.resolve(root, consumer);
  run('npm', ['link', 'grani-tag-engine', '--no-save'], consumerPath);
  console.log(`Linked grani-tag-engine into ${consumerPath} (package.json unchanged).`);
} else {
  console.log('Engine package is globally linked. In a consumer project run:');
  console.log('  npm link grani-tag-engine --no-save');
}
