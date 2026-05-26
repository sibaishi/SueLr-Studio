import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '..');
const outputDir = resolve(repoRoot, '.server-web-release');
const appDir = resolve(outputDir, 'app');
const manifestPath = resolve(repoRoot, 'scripts/deploy/server-web/release-files.txt');

function readReleaseManifest() {
  return readFileSync(manifestPath, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const [source, target] = line.split('|');
      if (!source || !target) {
        throw new Error(`invalid server-web release manifest entry: ${line}`);
      }
      return [source, target];
    });
}

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

for (const [source, target] of readReleaseManifest()) {
  copyEntry(source, target);
}

console.log(`server-web release directory prepared at ${outputDir}`);
