import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function readUtf8(path) {
  return readFileSync(resolve(path), 'utf8');
}

const failures = [];

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
];

for (const file of requiredFiles) {
  if (!existsSync(resolve(file))) {
    failures.push(`missing required repository hygiene file: ${file}`);
  }
}

if (failures.length === 0) {
  const rootPackage = JSON.parse(readUtf8('package.json'));
  const backendPackage = JSON.parse(readUtf8('backend/package.json'));
  const readme = readUtf8('README.md');
  const contributing = readUtf8('CONTRIBUTING.md');
  const developerGuide = readUtf8('docs/developer-guide.md');
  const ciWorkflow = readUtf8('.github/workflows/ci.yml');
  const gitignore = readUtf8('.gitignore');
  const windowsLauncher = readUtf8('start.bat');
  const unixLauncher = readUtf8('start.sh');

  const rootScripts = rootPackage?.scripts ?? {};
  const backendScripts = backendPackage?.scripts ?? {};

  for (const scriptName of [
    'install:all',
    'dev',
    'dev:frontend',
    'dev:backend',
    'build',
    'check',
    'test:e2e',
    'test:e2e:install',
    'check:repo-hygiene',
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
    { file: 'README.md', source: readme, snippets: ['npm run install:all', 'npm run dev', 'npm run check', 'npm run test:e2e', 'npm run test:e2e:install', 'CONTRIBUTING.md'] },
    { file: 'CONTRIBUTING.md', source: contributing, snippets: ['npm run install:all', 'npm run dev', 'npm run check', 'npm run test:e2e', 'npm run test:e2e:install', 'http://localhost:5173', 'http://127.0.0.1:3001'] },
    { file: 'docs/developer-guide.md', source: developerGuide, snippets: ['## Maintenance Workflow', 'npm run check', 'npm run test:e2e', 'npm run test:e2e:install', '.private-docs/'] },
  ];

  for (const documentCheck of documentChecks) {
    for (const snippet of documentCheck.snippets) {
      if (!documentCheck.source.includes(snippet)) {
        failures.push(`${documentCheck.file} is missing required repository hygiene detail: ${snippet}`);
      }
    }
  }

  for (const snippet of ['npm run check', 'npm run test:e2e', 'npm run test:e2e:install', 'actions/checkout@v5', 'actions/setup-node@v5']) {
    if (!ciWorkflow.includes(snippet)) {
      failures.push(`.github/workflows/ci.yml is missing required CI hygiene detail: ${snippet}`);
    }
  }

  for (const [file, source] of [['start.bat', windowsLauncher], ['start.sh', unixLauncher]]) {
    if (!source.includes('npm run dev')) {
      failures.push(`${file} must continue to launch the combined dev command.`);
    }
  }

  for (const entry of [
    'node_modules/',
    'backend/node_modules/',
    'dist/',
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
