import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const checks = [
  {
    path: 'tests/e2e/studio-smoke.spec.ts',
    sections: [
      "test('settings fields persist after reload'",
      "test('workflow can add a node from the sidebar'",
      "test('workflow toolbar can navigate back to settings'",
      "test('workflow editing can undo a newly added node'",
      "test('settings connection test syncs models into import list'",
    ],
  },
  {
    path: 'backend/tests/http-contract.test.js',
    sections: [
      "HTTP contract: settings endpoints use unified envelope",
      "HTTP contract: workflows CRUD endpoints return expected envelopes",
      "HTTP contract: capabilities chat route returns envelope-only payloads",
      "HTTP contract: capabilities image route returns envelope-only payloads",
      "HTTP contract: images generate route matches capabilities image validation",
      "HTTP contract: capabilities video status route returns envelope-only payloads",
    ],
  },
  {
    path: 'tests/unit/workflow-store/document.test.ts',
    sections: ['describe', 'test'],
  },
  {
    path: 'tests/unit/workflow-store/editor-graph.test.ts',
    sections: ['describe', 'test'],
  },
  {
    path: 'tests/unit/workflow-store/editor-groups.test.ts',
    sections: ['describe', 'test'],
  },
  {
    path: 'tests/unit/workflow-store/execution.test.ts',
    sections: ['describe', 'test'],
  },
];

const failures = [];

for (const check of checks) {
  const absolutePath = resolve(check.path);
  if (!existsSync(absolutePath)) {
    failures.push(`missing required test surface file: ${check.path}`);
    continue;
  }

  const source = readFileSync(absolutePath, 'utf8');
  for (const section of check.sections) {
    if (!source.includes(section)) {
      failures.push(`${check.path} is missing required coverage marker: ${section}`);
    }
  }
}

if (failures.length > 0) {
  console.error('Test surface check failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('Test surface check passed.');
