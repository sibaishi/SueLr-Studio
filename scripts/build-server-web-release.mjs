import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '..');
const outputDir = resolve(repoRoot, '.server-web-release');
const appDir = resolve(outputDir, 'app');

const copies = [
  ['dist', 'dist'],
  ['backend/package.json', 'backend/package.json'],
  ['backend/package-lock.json', 'backend/package-lock.json'],
  ['backend/server.js', 'backend/server.js'],
  ['backend/src', 'backend/src'],
  ['src/shared/workflow', 'src/shared/workflow'],
  ['package.json', 'package.json'],
  ['package-lock.json', 'package-lock.json'],
  ['scripts/deploy/server-web/Dockerfile', 'scripts/deploy/server-web/Dockerfile'],
];

function ensureParent(targetPath) {
  mkdirSync(dirname(targetPath), { recursive: true });
}

function copyEntry(sourceRelative, targetRelative) {
  const source = resolve(repoRoot, sourceRelative);
  const target = resolve(appDir, targetRelative);
  if (!existsSync(source)) {
    throw new Error(`missing release source: ${sourceRelative}`);
  }
  ensureParent(target);
  cpSync(source, target, { recursive: true });
}

rmSync(outputDir, { recursive: true, force: true });
mkdirSync(appDir, { recursive: true });

for (const [source, target] of copies) {
  copyEntry(source, target);
}

console.log(`server-web release directory prepared at ${outputDir}`);
