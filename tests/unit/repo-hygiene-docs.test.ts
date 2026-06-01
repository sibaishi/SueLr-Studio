import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readUtf8(path: string) {
  return readFileSync(resolve(path), 'utf8');
}

function collectSourceFiles(root: string, files: string[] = []) {
  const entries = readdirSync(resolve(root), { withFileTypes: true });
  for (const entry of entries) {
    const next = `${root}/${entry.name}`;
    if (entry.isDirectory()) {
      if (entry.name === 'lib' && root === 'src') continue;
      collectSourceFiles(next, files);
      continue;
    }
    if (entry.isFile() && /\.(ts|tsx|js|jsx)$/.test(entry.name)) {
      files.push(next);
    }
  }
  return files;
}

describe('repository documentation and branch hygiene', () => {
  it('documents the current main trunk plus three release branches consistently', () => {
    const contributing = readUtf8('CONTRIBUTING.md');
    const developerGuide = readUtf8('docs/developer-guide.md');
    const releaseSop = readUtf8('docs/release-sop.md');

    for (const source of [contributing, developerGuide, releaseSop]) {
      expect(source).toContain('main');
      expect(source).toContain('release/local-web');
      expect(source).toContain('release/desktop');
      expect(source).toContain('release/server-web');
    }
  });

  it('documents domains, providers, and shared runtime ownership consistently', () => {
    const agents = readUtf8('AGENTS.md');
    const developerGuide = readUtf8('docs/developer-guide.md');

    for (const source of [agents, developerGuide]) {
      expect(source).toContain('src/domains/');
      expect(source).toContain('src/providers/');
      expect(source).toContain('src/shared/runtime/');
      expect(source).toContain('src/shared/providers/');
      expect(source).toContain('src/shared/types/');
    }
  });

  it('keeps application source off the legacy @/lib import surface', () => {
    const sourceFiles = collectSourceFiles('src');
    for (const file of sourceFiles) {
      expect(readUtf8(file)).not.toContain(`@/lib/`);
    }
  });

  it('keeps local-web launcher scripts and package entrypoints aligned with the public docs', () => {
    const packageJson = readUtf8('package.json');
    const userGuide = readUtf8('docs/user-guide.md');
    const startDev = readUtf8('scripts/start-dev.mjs');
    const startLocalWeb = readUtf8('scripts/start-local-web.mjs');
    const buildLocalWeb = readUtf8('scripts/build-local-web.mjs');

    expect(packageJson).toContain('"dev:local-web"');
    expect(packageJson).toContain('"build:local-web"');
    expect(packageJson).toContain('"start:local-web"');
    expect(startDev).toContain("APP_RUNTIME_MODE: 'local-web'");
    expect(startLocalWeb).toContain("APP_FRONTEND_DIST: distDir");
    expect(startLocalWeb).toContain("APP_RUNTIME_MODE: 'local-web'");
    expect(startLocalWeb).toContain('const frontendUrl = `http://localhost:${backendPort}`');
    expect(buildLocalWeb).toContain("runNpmChecked(['run', 'build']");
    expect(userGuide).toContain('npm.cmd run dev:local-web');
    expect(userGuide).toContain('npm.cmd run build:local-web');
    expect(userGuide).toContain('npm.cmd run start:local-web');
  });

  it('keeps workflow structure guards aligned with the canonical domains path', () => {
    const workflowStoreCheck = readUtf8('scripts/check-workflow-store-structure.mjs');

    expect(workflowStoreCheck).toContain('src/domains/workflow/lib/store.ts');
    expect(workflowStoreCheck).toContain('src/domains/workflow/lib/store/editor.ts');
    expect(workflowStoreCheck).not.toContain('src/features/workflow/lib/store.ts');
  });

  it('keeps workflow node content implementations in node type folders', () => {
    const allowedRootNodeEntrypoints = new Set(['NodeContent.tsx']);
    const rootNodeFiles = readdirSync(resolve('src/domains/workflow/components/nodes'), { withFileTypes: true })
      .filter((entry) => entry.isFile() && /Content\.tsx$|Workbench\.tsx$/.test(entry.name))
      .filter((entry) => !allowedRootNodeEntrypoints.has(entry.name))
      .map((entry) => `src/domains/workflow/components/nodes/${entry.name}`);

    for (const file of rootNodeFiles) {
      const source = readUtf8(file).trim();
      expect(source).toMatch(/^export /);
      expect(source).not.toContain('export function ');
      expect(source).not.toContain('return (');
    }

    for (const file of [
      'src/domains/workflow/components/nodes/explicitContentRegistry.tsx',
      'src/domains/workflow/components/nodes/fileInputRegistry.tsx',
      'src/domains/workflow/components/nodes/mergeContentRegistry.tsx',
      'src/domains/workflow/components/nodes/settingsContentRegistry.tsx',
    ]) {
      const source = readUtf8(file);
      expect(source).not.toContain('=> (');
      expect(source).not.toContain('return (');
    }
  });

  it('keeps critical app, shared ios, settings, workflow, and public docs readable in UTF-8', () => {
    const readme = readUtf8('README.md');
    const userGuide = readUtf8('docs/user-guide.md');
    const logPanel = readUtf8('src/shared/ui/ios/LogPanel.tsx');
    const roleEditor = readUtf8('src/shared/ui/ios/RoleEditor.tsx');
    const taskDetailModal = readUtf8('src/shared/ui/ios/TaskDetailModal.tsx');
    const defaultsSection = readUtf8('src/features/settings/components/DefaultsSection.tsx');
    const connectionSection = readUtf8('src/features/settings/components/ConnectionSettingsSection.tsx');
    const settingsPanel = readUtf8('src/features/settings/components/SettingsPanel.tsx');
    const onboarding = readUtf8('src/features/settings/components/FirstRunOnboarding.tsx');
    const appShell = readUtf8('src/app/App.tsx');
    const navigation = readUtf8('src/app/navigation/Navigation.tsx');
    const workflowStatusBar = readUtf8('src/domains/workflow/components/StatusBar.tsx');
    const developerGuide = readUtf8('docs/developer-guide.md');

    expect(readme).toContain('SueLr Studio 是一个本地优先的多模态 AI 工作台');
    expect(readme).toContain('运行时数据默认存放在系统配置目录');
    expect(userGuide).toContain('`文本输入`');
    expect(userGuide).toContain('`文本清理`');
    expect(userGuide).toContain('`文本逐项`');
    expect(userGuide).toContain('`图像逐项`');
    expect(logPanel).toContain('还没有日志');
    expect(roleEditor).toContain('系统提示词');
    expect(taskDetailModal).toContain('任务详情');
    expect(defaultsSection).toContain('外部数据路径');
    expect(connectionSection).toContain('测试连接');
    expect(settingsPanel).toContain('工作室设置');
    expect(onboarding).toContain('开始前，先完成你的本地配置');
    expect(appShell).toContain('已连接到聊天触发的工作流运行');
    expect(navigation).toContain('未连接模型');
    expect(workflowStatusBar).toContain('未命名工作流');
    expect(developerGuide).toContain('文本逐项');
    expect(developerGuide).toContain('图像逐项');
  });
});
