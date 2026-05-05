import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function readUtf8(path) {
  return readFileSync(resolve(path), 'utf8');
}

const failures = [];

const requiredFiles = [
  '.env.example',
  'README.md',
  'docs/user-guide.md',
  'docs/developer-guide.md',
  'backend/server.js',
  'backend/src/app/create-app.js',
  'backend/package.json',
  'package.json',
];

for (const file of requiredFiles) {
  if (!existsSync(resolve(file))) {
    failures.push(`missing required runtime baseline file: ${file}`);
  }
}

if (failures.length === 0) {
  const rootPackage = JSON.parse(readUtf8('package.json'));
  const backendPackage = JSON.parse(readUtf8('backend/package.json'));
  const envExample = readUtf8('.env.example');
  const userGuide = readUtf8('docs/user-guide.md');
  const developerGuide = readUtf8('docs/developer-guide.md');
  const readme = readUtf8('README.md');
  const serverSource = readUtf8('backend/server.js');
  const createAppSource = readUtf8('backend/src/app/create-app.js');

  const rootNodeEngine = rootPackage?.engines?.node;
  const backendNodeEngine = backendPackage?.engines?.node;

  if (rootNodeEngine !== backendNodeEngine) {
    failures.push(`root and backend node engine ranges must match (${rootNodeEngine} !== ${backendNodeEngine}).`);
  }

  if (rootNodeEngine !== '>=22.12.0') {
    failures.push('root package node engine must stay at the unbounded minimum baseline: >=22.12.0.');
  }

  for (const variable of ['VITE_API_BASE=', 'APP_PORT=', 'APP_HOST=', 'APP_ALLOWED_ORIGINS=']) {
    if (!envExample.includes(variable)) {
      failures.push(`.env.example is missing required variable: ${variable}`);
    }
  }

  for (const snippet of ['http://localhost:5173', 'http://127.0.0.1:3001', 'APP_CONFIG_DIR']) {
    if (!userGuide.includes(snippet)) {
      failures.push(`docs/user-guide.md is missing runtime baseline detail: ${snippet}`);
    }
  }

  for (const snippet of ['## Repository Layout', '## Testing Strategy', '## Public Documentation Policy']) {
    if (!developerGuide.includes(snippet)) {
      failures.push(`docs/developer-guide.md is missing baseline section: ${snippet}`);
    }
  }

  for (const snippet of ['docs/user-guide.md', 'docs/developer-guide.md']) {
    if (!readme.includes(snippet)) {
      failures.push(`README.md must link to ${snippet}.`);
    }
  }

  for (const snippet of ["process.env.APP_PORT || process.env.PORT || 3001", "process.env.APP_HOST || '127.0.0.1'"]) {
    if (!serverSource.includes(snippet)) {
      failures.push(`backend/server.js is missing default runtime baseline: ${snippet}`);
    }
  }

  for (const snippet of ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:4173', 'http://127.0.0.1:4173']) {
    if (!createAppSource.includes(snippet)) {
      failures.push(`backend/src/app/create-app.js is missing allowed-origin baseline: ${snippet}`);
    }
  }
}

if (failures.length > 0) {
  console.error('Runtime baseline check failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('Runtime baseline check passed.');
