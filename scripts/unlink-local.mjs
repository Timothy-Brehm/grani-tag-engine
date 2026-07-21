#!/usr/bin/env node
/**
 * Remove a local npm link of grani-tag-engine from a consumer project.
 * Does not change package.json / lockfile of consumers.
 *
 * Usage:
 *   node scripts/unlink-local.mjs --consumer ../astrevno
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

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

const consumerFlag = process.argv.indexOf('--consumer');
const consumerArg = consumerFlag !== -1 ? process.argv[consumerFlag + 1] : '../astrevno';
if (!consumerArg) {
  console.error('Missing path after --consumer');
  process.exit(1);
}

const consumerPath = path.resolve(root, consumerArg);
run('npm', ['unlink', 'grani-tag-engine', '--no-save'], consumerPath);
console.log(`Unlinked grani-tag-engine from ${consumerPath}. Re-run npm install to restore the registry package.`);
