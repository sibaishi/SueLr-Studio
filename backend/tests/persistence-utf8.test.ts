// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { workflowsRepository } from '../src/modules/workflows/workflows.repository.ts';
import { settingsRepository } from '../src/modules/settings/settings.repository.ts';
import { STORAGE_PATHS, ensureStorageDirectories } from '../src/platform/storage/index.ts';

test('workflow storage preserves UTF-8 text on save and reload', () => {
  ensureStorageDirectories();
  const workflowId = `wf_utf8_${Date.now()}`;
  const workflow = {
    id: workflowId,
    name: '中文工作流',
    description: '保存和读取都应保留中文。',
    nodes: [],
    edges: [],
  };

  try {
    workflowsRepository.save(workflowId, workflow);
    const loaded = workflowsRepository.read(workflowId).workflow;
    assert.equal(loaded.name, workflow.name);
    assert.equal(loaded.description, workflow.description);
  } finally {
    fs.rmSync(path.join(STORAGE_PATHS.workflowsDir, `${workflowId}.json`), { force: true });
  }
});

test('settings storage preserves UTF-8 text on save and reload', () => {
  ensureStorageDirectories();
  const original = settingsRepository.readSettings();
  const next = {
    ...original,
    ui: {
      ...original.ui,
      customRoles: [
        {
          id: 'role-utf8',
          name: '中文角色',
          icon: 'sparkles',
          systemPrompt: '请始终使用中文回答。',
          tools: [],
          isCustom: true,
        },
      ],
    },
  };

  try {
    settingsRepository.updateSettings(next);
    const loaded = settingsRepository.readSettings();
    assert.equal(loaded.ui.customRoles[0].name, '中文角色');
    assert.equal(loaded.ui.customRoles[0].systemPrompt, '请始终使用中文回答。');
  } finally {
    settingsRepository.updateSettings(original);
  }
});
