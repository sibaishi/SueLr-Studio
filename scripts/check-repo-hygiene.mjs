import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

function readUtf8(path) {
  return readFileSync(resolve(path), 'utf8');
}

function collectFiles(root, matcher, results = []) {
  if (!existsSync(resolve(root))) return results;
  const entries = readdirSync(resolve(root), { withFileTypes: true });
  for (const entry of entries) {
    const relative = `${root}/${entry.name}`;
    if (entry.isDirectory()) {
      if (['node_modules', 'dist', 'playwright-report', 'test-results'].includes(entry.name)) continue;
      collectFiles(relative, matcher, results);
      continue;
    }
    if (entry.isFile() && matcher(relative)) {
      results.push(relative);
    }
  }
  return results;
}

const failures = [];
const allowedRootDirectories = new Set([
  '.claude',
  '.git',
  '.github',
  '.private-docs',
  '.run-logs',
  '.server-web-release',
  'backend',
  'build',
  'dist',
  'docs',
  'electron',
  'node_modules',
  'playwright-report',
  'release',
  'scripts',
  'src',
  'storage',
  'test-results',
  'tests',
  'workflows',
]);
const allowedRootFiles = new Set([
  '.env.example',
  '.gitignore',
  'AGENTS.md',
  'admin.html',
  'CONTRIBUTING.md',
  'README.md',
  'index.html',
  'package-lock.json',
  'package.json',
  'playwright.config.ts',
  'start.bat',
  'start.sh',
  'tsconfig.json',
  'vite.config.ts',
  'vitest.config.ts',
]);

const requiredFiles = [
  'CONTRIBUTING.md',
  'README.md',
  'docs/user-guide.md',
  'docs/developer-guide.md',
  'start.bat',
  'start.sh',
  '.gitignore',
  '.github/workflows/ci.yml',
  'package.json',
  'backend/package.json',
  'scripts/check-encoding.mjs',
];

for (const file of requiredFiles) {
  if (!existsSync(resolve(file))) {
    failures.push(`missing required repository hygiene file: ${file}`);
  }
}

if (failures.length === 0) {
  const rootEntries = readdirSync(resolve('.'), { withFileTypes: true });
  const rootPackage = JSON.parse(readUtf8('package.json'));
  const backendPackage = JSON.parse(readUtf8('backend/package.json'));
  const readme = readUtf8('README.md');
  const contributing = readUtf8('CONTRIBUTING.md');
  const developerGuide = readUtf8('docs/developer-guide.md');
  const userGuide = readUtf8('docs/user-guide.md');
  const releaseSop = readUtf8('docs/release-sop.md');
  const deploymentPlan = readUtf8('docs/deployment-variants-plan.md');
  const ciWorkflow = readUtf8('.github/workflows/ci.yml');
  const gitignore = readUtf8('.gitignore');
  const windowsLauncher = readUtf8('start.bat');
  const unixLauncher = readUtf8('start.sh');
  const sourceFiles = collectFiles('src', (file) => file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.js') || file.endsWith('.jsx'));

  const rootScripts = rootPackage?.scripts ?? {};
  const backendScripts = backendPackage?.scripts ?? {};

  for (const scriptName of [
    'install:all',
    'start',
    'dev',
    'dev:frontend',
    'dev:backend',
    'build',
    'check',
    'test:e2e',
    'test:e2e:install',
    'check:repo-hygiene',
    'check:encoding',
    'check:docs',
  ]) {
    if (!rootScripts[scriptName]) {
      failures.push(`package.json is missing required root script: ${scriptName}`);
    }
  }

  for (const scriptName of ['start', 'dev', 'test']) {
    if (!backendScripts[scriptName]) {
      failures.push(`backend/package.json is missing required backend script: ${scriptName}`);
    }
  }

  const documentChecks = [
    { file: 'README.md', source: readme, snippets: ['SueLr Studio', '`main`', 'npm run install:all', 'npm run dev', 'npm run check', 'npm run test:e2e', 'npm run test:e2e:install', 'CONTRIBUTING.md'] },
    { file: 'CONTRIBUTING.md', source: contributing, snippets: ['npm run install:all', 'npm run dev', 'npm run check', 'npm run test:e2e', 'npm run test:e2e:install', 'http://localhost:5173', 'http://127.0.0.1:3001', '## Branch Model', '`main`', '`release/local-web`', '`release/desktop`', '`release/server-web`', 'docs/deployment-variants-plan.md'] },
    { file: 'docs/user-guide.md', source: userGuide, snippets: ['`文本输入`', '`文本清理`', '`文本逐项`', '`图像逐项`', 'Alt+G', 'Ctrl+Shift+Enter', 'Ctrl+C', 'Ctrl+V'] },
    { file: 'docs/developer-guide.md', source: developerGuide, snippets: ['## Maintenance Workflow', 'npm run check', 'npm run test:e2e', 'npm run test:e2e:install', '.private-docs/', 'UTF-8', '## Variant Delivery Model', '`main`', '`release/local-web`', '`release/desktop`', '`release/server-web`', 'docs/deployment-variants-plan.md'] },
    { file: 'docs/release-sop.md', source: releaseSop, snippets: ['`main` is the shared long-lived source branch in this repository.', '`release/local-web`', '`release/desktop`', '`release/server-web`', 'docs/deployment-variants-plan.md', 'npm.cmd run check:docs'] },
    { file: 'docs/deployment-variants-plan.md', source: deploymentPlan, snippets: ['## Branch Model', '## Mainline First Changes', '## Local-Web Variant', '## Server Single-User Variant', '## Milestones', 'scripts/start-local-web.mjs', 'release/server-web'] },
  ];

  for (const documentCheck of documentChecks) {
    for (const snippet of documentCheck.snippets) {
      if (!documentCheck.source.includes(snippet)) {
        failures.push(`${documentCheck.file} is missing required repository hygiene detail: ${snippet}`);
      }
    }
  }

  for (const snippet of ['npm run check', 'npm run test:e2e', 'npm run test:e2e:install', 'actions/checkout@v5', 'actions/setup-node@v5', 'frontend-e2e', 'quality-gate']) {
    if (!ciWorkflow.includes(snippet)) {
      failures.push(`.github/workflows/ci.yml is missing required CI hygiene detail: ${snippet}`);
    }
  }

  for (const [file, source] of [['start.bat', windowsLauncher], ['start.sh', unixLauncher]]) {
    if (!source.includes('npm start')) {
      failures.push(`${file} must continue to launch the one-click start command.`);
    }
  }

  for (const entry of rootEntries) {
    if (entry.isDirectory()) {
      if (!allowedRootDirectories.has(entry.name)) {
        failures.push(`unexpected root directory: ${entry.name}`);
      }
      continue;
    }
    if (entry.isFile() && !allowedRootFiles.has(entry.name)) {
      failures.push(`unexpected root file: ${entry.name}`);
    }
  }

  if (existsSync(resolve('development'))) {
    failures.push('development/ must stay drained; move durable content into scripts/, docs/, or .private-docs/.');
  }

  for (const file of sourceFiles) {
    if (file.startsWith('src/lib/')) continue;
    const source = readUtf8(file);
    if (source.includes(`@/lib/`)) {
      failures.push(`${file} must not import from @/lib/. Use the canonical app/shared/domain path instead.`);
    }
  }

  for (const entry of [
    'node_modules/',
    'backend/node_modules/',
    'dist/',
    'release/',
    '.server-web-release/',
    '.logs/',
    '.run-logs/',
    'playwright-report/',
    'test-results/',
    '.private-docs/',
  ]) {
    if (!gitignore.includes(entry)) {
      failures.push(`.gitignore is missing required generated-path entry: ${entry}`);
    }
  }
}

if (failures.length > 0) {
  console.error('Repository hygiene check failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('Repository hygiene check passed.');
