import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const checks = [
  {
    path: 'docs/user-guide.md',
    sections: ['## Overview', '## Install', '## Start The App', '## Main User Flows', '## Troubleshooting'],
  },
  {
    path: 'docs/developer-guide.md',
    sections: [
      '## Overview',
      '## Repository Layout',
      '## Frontend Structure',
      '## Backend Structure',
      '## Testing Strategy',
      '## Public Documentation Policy',
    ],
  },
  {
    path: 'docs/release-sop.md',
    sections: ['## Branching', '## Standard Release Flow', '## Versioning Guidance', '## Notes'],
  },
  {
    path: 'docs/deployment-variants-plan.md',
    sections: [
      '## Branch Model',
      '## Mainline First Changes',
      '## Local-Web Variant',
      '## Server Single-User Variant',
      '## Milestones',
    ],
  },
];

const failures = [];
const allowedMarkdownDocs = new Set([
  'docs/user-guide.md',
  'docs/developer-guide.md',
  'docs/release-sop.md',
  'docs/deployment-variants-plan.md',
]);

function collectMarkdownFiles(dir, bucket = []) {
  for (const entry of readdirSync(resolve(dir), { withFileTypes: true })) {
    const entryPath = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      collectMarkdownFiles(entryPath, bucket);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.md')) {
      bucket.push(entryPath.replaceAll('\\', '/'));
    }
  }
  return bucket;
}

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

if (existsSync(resolve('docs'))) {
  const markdownFiles = collectMarkdownFiles('docs');
  for (const file of markdownFiles) {
    if (!allowedMarkdownDocs.has(file)) {
      failures.push(`docs directory may only contain public markdown docs, found extra file: ${file}`);
    }
  }
}

if (failures.length > 0) {
  console.error('Documentation check failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('Documentation check passed.');
