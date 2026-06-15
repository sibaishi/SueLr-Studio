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
];

const failures = [];
const allowedMarkdownDocs = new Set([
  'docs/user-guide.md',
  'docs/developer-guide.md',
  'docs/release-sop.md',
  'docs/imageGenV2-changes.md',
  'docs/intelligence/README.md',
  'docs/intelligence/00-master-plan.md',
  'docs/intelligence/01-phased-execution-plan.md',
  'docs/intelligence/02-acceptance-plan.md',
  'docs/intelligence/03-legacy-agent-replacement-plan.md',
  'docs/intelligence/04-knowledge-base-taxonomy.md',
  'docs/intelligence/05-conversational-agent-planner.md',
  'docs/intelligence/06-governance-and-gates.md',
  'docs/intelligence/07-local-mvp-manual-acceptance-kit.md',
  'docs/intelligence/zh/README.md',
  'docs/intelligence/zh/00-总计划方案.md',
  'docs/intelligence/zh/01-分阶段执行方案.md',
  'docs/intelligence/zh/02-分阶段验收与总验收计划.md',
  'docs/intelligence/zh/03-现有Agent替换计划.md',
  'docs/intelligence/zh/04-知识库分类与治理方案.md',
  'docs/intelligence/zh/05-对话式Agent与工具规划方案.md',
  'docs/intelligence/zh/06-治理门禁与推进规则.md',
  'docs/intelligence/zh/07-本地MVP人工验收手册.md',
  'docs/intelligence/zh/07-Agent实测问题反馈表.md',
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
