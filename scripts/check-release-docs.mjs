import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const checks = [
  {
    path: 'docs/ops/release-checklist.md',
    sections: ['## Scope', '## Automated Gates', '## Manual Smoke', '## Release Record'],
  },
  {
    path: 'docs/ops/regression-matrix.md',
    sections: ['## Scope', '## Matrix', '## Change Mapping Rules'],
  },
  {
    path: 'docs/ops/triage-entrypoints.md',
    sections: ['## Scope', '## Startup And Configuration', '## Workflow Execution', '## Provider And Media Requests', '## Frontend Failures'],
  },
  {
    path: 'docs/ops/release-rhythm.md',
    sections: ['## Scope', '## Per Change', '## Per Release', '## Per Regression'],
  },
];

const failures = [];

for (const check of checks) {
  const absolutePath = resolve(check.path);
  if (!existsSync(absolutePath)) {
    failures.push(`missing required release document: ${check.path}`);
    continue;
  }

  const source = readFileSync(absolutePath, 'utf8');
  for (const section of check.sections) {
    if (!source.includes(section)) {
      failures.push(`${check.path} is missing required section: ${section}`);
    }
  }
}

if (failures.length > 0) {
  console.error('Release docs check failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('Release docs check passed.');
