import { expect, test } from '@playwright/test';

async function clearLocalState(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.request.post('/api/settings/reset');
  await page.evaluate(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.localStorage.setItem('suelr_onboarding_dismissed', 'true');
  });
  await page.reload();

  await expect(page.getByTestId('workflow-page')).toBeVisible({ timeout: 10_000 });
}

async function addTextInputNode(page: import('@playwright/test').Page) {
  await page.getByTestId('workflow-add-node').click();
  await page.getByTestId('workflow-node-catalog-item-io').click();
}

async function addWorkflowNode(page: import('@playwright/test').Page, nodeType: 'aiV3' | 'io') {
  await page.getByTestId('workflow-add-node').click();
  if (nodeType === 'aiV3') {
    await page.getByRole('button', { name: /AI 能力/ }).click();
  }
  await page.getByTestId(`workflow-node-catalog-item-${nodeType}`).click();
}

async function openSettings(page: import('@playwright/test').Page) {
  await page.getByTestId('workflow-open-settings').click();
  await expect(page.getByTestId('settings-page')).toBeVisible();
}

async function openConnectionSettings(page: import('@playwright/test').Page) {
  await openSettings(page);
  await page.getByTestId('settings-module-connection').click();
  await expect(page.getByTestId('settings-base-url-field')).toBeVisible();
}

async function readPersistedStudioConfig(page: import('@playwright/test').Page) {
  return page.evaluate(async () => {
    const response = await fetch('/api/settings/studio');
    const payload = await response.json();
    const runtime = payload?.data?.runtime;
    const activeConfigId = runtime?.activeConfigId;
    const configs = Array.isArray(runtime?.configs) ? runtime.configs : [];
    const activeConfig = configs.find((config: { id?: string }) => config.id === activeConfigId) ?? configs[0] ?? null;

    return {
      activeConfigId,
      activeConfig,
    };
  });
}

async function readStableNodeCount(page: import('@playwright/test').Page) {
  await expect
    .poll(
      async () => {
        const first = await page.locator('.react-flow__node').count();
        await page.waitForTimeout(250);
        const second = await page.locator('.react-flow__node').count();
        return first === second ? second : Number.NaN;
      },
      {
        timeout: 5_000,
        intervals: [250, 500],
      },
    )
    .not.toBeNaN();
  return page.locator('.react-flow__node').count();
}

async function readWorkflowByName(page: import('@playwright/test').Page, name: string) {
  return page.evaluate(async (workflowName) => {
    const response = await fetch('/api/workflows');
    const payload = await response.json();
    const workflows = Array.isArray(payload?.data) ? payload.data : [];
    return workflows.find((workflow: { name?: string }) => workflow.name === workflowName) ?? null;
  }, name);
}

async function readWorkflowDocument(page: import('@playwright/test').Page, workflowId: string) {
  return page.evaluate(async (id) => {
    const response = await fetch(`/api/workflows/${encodeURIComponent(id)}`);
    const payload = await response.json();
    return payload?.data ?? null;
  }, workflowId);
}

async function readDuplicateWorkflow(
  page: import('@playwright/test').Page,
  originalId: string,
  workflowName: string,
) {
  return page.evaluate(
    async ({ sourceId, sourceName }) => {
      const response = await fetch('/api/workflows');
      const payload = await response.json();
      const workflows = Array.isArray(payload?.data) ? payload.data : [];
      return (
        workflows.find(
          (workflow: { id?: string; name?: string }) =>
            workflow.id !== sourceId && typeof workflow.name === 'string' && workflow.name.startsWith(sourceName),
        ) ?? null
      );
    },
    { sourceId: originalId, sourceName: workflowName },
  );
}

async function readWorkflowExistence(
  page: import('@playwright/test').Page,
  originalId: string,
  duplicatedId: string,
) {
  return page.evaluate(
    async ({ sourceId, copyId }) => {
      const response = await fetch('/api/workflows');
      const payload = await response.json();
      const workflows = Array.isArray(payload?.data) ? payload.data : [];
      return {
        originalExists: workflows.some((workflow: { id?: string }) => workflow.id === sourceId),
        duplicateExists: workflows.some((workflow: { id?: string }) => workflow.id === copyId),
      };
    },
    { sourceId: originalId, copyId: duplicatedId },
  );
}

test.describe('studio smoke', () => {
  test('public developer docs reflect the current main plus release branch model', async ({ page }) => {
    await page.goto('/docs/developer-guide.md');
    await expect(page.locator('body')).toContainText('## Variant Delivery Model');
    await expect(page.locator('body')).toContainText('main');
    await expect(page.locator('body')).toContainText('release/local-web');
    await expect(page.locator('body')).toContainText('release/desktop');
  });

  test('settings fields persist after reload', async ({ page }) => {
    const seed = Date.now().toString(36);
    const configName = `E2E Config ${seed}`;
    const baseUrl = `https://example-${seed}.test/v1`;
    const apiKey = `sk-e2e-${seed}`;

    await clearLocalState(page);
    await openConnectionSettings(page);
    await expect(page.locator('.splash-overlay')).toHaveCount(0);

    const configNameInput = page.getByTestId('settings-config-name-field').locator('input');
    const baseUrlInput = page.getByTestId('settings-base-url-field').locator('input');
    const apiKeyInput = page.getByTestId('settings-api-key-field').locator('input');

    await configNameInput.fill(configName);
    await baseUrlInput.fill(baseUrl);
    await apiKeyInput.fill(apiKey);

    await expect.poll(async () => {
      const persisted = await readPersistedStudioConfig(page);
      return JSON.stringify({
        name: persisted.activeConfig?.name ?? '',
        base: persisted.activeConfig?.base ?? '',
        apiKey: persisted.activeConfig?.apiKey ?? '',
        apiKeySet: Boolean(persisted.activeConfig?.apiKeySet),
      });
    }, {
      timeout: 10_000,
      intervals: [250, 500, 1_000],
    }).toBe(JSON.stringify({
      name: configName,
      base: baseUrl,
      apiKey: '',
      apiKeySet: true,
    }));

    await page.reload();
    await openConnectionSettings(page);

    await expect(configNameInput).toHaveValue(configName);
    await expect(baseUrlInput).toHaveValue(baseUrl);
    await expect(apiKeyInput).toHaveValue('');
  });

  test('workflow can add a node from the floating toolbar', async ({ page }) => {
    await clearLocalState(page);

    await expect(page.getByTestId('workflow-page')).toBeVisible();

    const beforeCount = await readStableNodeCount(page);

    await addTextInputNode(page);

    await expect(page.locator('.react-flow__node')).toHaveCount(beforeCount + 1);
  });

  test('AI V3 and IO nodes preserve their shared shell behavior and distinct types', async ({ page }) => {
    const workflowName = `E2E Shared Node Shell ${Date.now().toString(36)}`;

    await clearLocalState(page);
    await page.getByTestId('workflow-new').click();
    await page.locator('.workflow-toolbar__title--editable').click();
    await page.locator('.workflow-toolbar__title-input').fill(workflowName);
    await page.keyboard.press('Enter');

    await addWorkflowNode(page, 'io');
    await addWorkflowNode(page, 'aiV3');

    const ioNode = page.locator('.react-flow__node').filter({ hasText: 'IO' }).last();
    const aiNode = page.locator('.react-flow__node').filter({ hasText: 'AI 能力 V3' }).last();
    await expect(ioNode).toBeVisible();
    await expect(aiNode).toBeVisible();

    await aiNode.locator('.node-v2-appendix-label').click();
    await page.locator('.node-v2-appendix-label-input').fill('AI 审查节点');
    await page.keyboard.press('Enter');
    const renamedAiNode = page.locator('.react-flow__node').filter({ hasText: 'AI 审查节点' }).last();
    await expect(renamedAiNode.locator('.node-v2-appendix-label-text')).toHaveText('AI 审查节点');

    await renamedAiNode.getByTitle('锁定').click();
    await expect(renamedAiNode.getByTitle('解锁')).toBeVisible();

    await page.getByTestId('workflow-save').click();
    await expect
      .poll(async () => Boolean(await readWorkflowByName(page, workflowName)), {
        timeout: 10_000,
        intervals: [250, 500, 1_000],
      })
      .toBe(true);

    const savedWorkflow = await readWorkflowByName(page, workflowName);
    const savedDocument = await readWorkflowDocument(page, (savedWorkflow as { id: string }).id);
    const savedNodes = Array.isArray(savedDocument?.nodes) ? savedDocument.nodes : [];
    expect(savedNodes.some((node: { type?: string }) => node.type === 'io')).toBe(true);
    expect(
      savedNodes.some(
        (node: { type?: string; data?: { label?: string; locked?: boolean } }) =>
          node.type === 'aiV3' && node.data?.label === 'AI 审查节点' && node.data?.locked === true,
      ),
    ).toBe(true);
  });

  test('workflow can save and reload a created workflow', async ({ page }) => {
    const workflowName = `E2E Workflow Save ${Date.now().toString(36)}`;

    await clearLocalState(page);

    await expect(page.getByTestId('workflow-page')).toBeVisible();

    await page.getByTestId('workflow-new').click();
    await page.locator('.workflow-toolbar__title--editable').click();
    await page.locator('.workflow-toolbar__title-input').fill(workflowName);
    await page.keyboard.press('Enter');
    const beforeCount = await readStableNodeCount(page);
    await addTextInputNode(page);
    const expectedNodeCount = beforeCount + 1;
    await page.getByTestId('workflow-save').click();

    await expect
      .poll(async () => Boolean(await readWorkflowByName(page, workflowName)), {
        timeout: 10_000,
        intervals: [250, 500, 1_000],
      })
      .toBe(true);

    const savedWorkflow = await readWorkflowByName(page, workflowName);
    const workflowId = (savedWorkflow as { id?: string }).id;
    expect(typeof workflowId).toBe('string');

    const savedDocument = await readWorkflowDocument(page, workflowId as string);
    expect(savedDocument?.name).toBe(workflowName);
    expect(Array.isArray(savedDocument?.nodes) ? savedDocument.nodes.length : 0).toBe(expectedNodeCount);

    await page.reload();
    await expect(page.getByTestId('workflow-page')).toBeVisible();
    await expect(page.locator('.workflow-toolbar__title')).toHaveText(workflowName);
    await expect(page.locator('.react-flow__node')).toHaveCount(expectedNodeCount);
  });

  test('workflow can duplicate and delete a saved workflow', async ({ page }) => {
    const workflowName = `E2E Workflow Duplicate ${Date.now().toString(36)}`;

    await clearLocalState(page);

    await expect(page.getByTestId('workflow-page')).toBeVisible();

    await page.getByTestId('workflow-new').click();
    await page.locator('.workflow-toolbar__title--editable').click();
    await page.locator('.workflow-toolbar__title-input').fill(workflowName);
    await page.keyboard.press('Enter');
    await addTextInputNode(page);
    await page.getByTestId('workflow-save').click();

    await expect
      .poll(async () => Boolean(await readWorkflowByName(page, workflowName)), {
        timeout: 10_000,
        intervals: [250, 500, 1_000],
      })
      .toBe(true);
    const original = await readWorkflowByName(page, workflowName);
    const originalId = (original as { id?: string }).id;
    expect(typeof originalId).toBe('string');

    await page.getByTestId('workflow-duplicate').click();

    await expect
      .poll(
        async () => Boolean(await readDuplicateWorkflow(page, originalId as string, workflowName)),
        {
          timeout: 10_000,
          intervals: [250, 500, 1_000],
        },
      )
      .toBe(true);

    const duplicated = await readDuplicateWorkflow(page, originalId as string, workflowName);
    const duplicatedId = (duplicated as { id?: string }).id;
    expect(typeof duplicatedId).toBe('string');
    await expect(page.locator('.workflow-toolbar__title')).toHaveText((duplicated as { name: string }).name);

    await page.getByTestId('workflow-delete').click();
    const deleteDialog = page.getByRole('dialog', {
      name: `删除“${(duplicated as { name: string }).name}”？`,
    });
    await expect(deleteDialog).toBeVisible();
    await deleteDialog.getByRole('button', { name: '删除', exact: true }).click();

    await expect
      .poll(
        async () => readWorkflowExistence(page, originalId as string, duplicatedId as string),
        {
          timeout: 10_000,
          intervals: [250, 500, 1_000],
        },
      )
      .toEqual({ originalExists: true, duplicateExists: false });
  });

  test('workflow import opens a new unsaved draft tab without persisting to the library', async ({ page }) => {
    await clearLocalState(page);

    await expect(page.getByTestId('workflow-page')).toBeVisible();

    await addTextInputNode(page);
    await page.getByRole('button', { name: '保存' }).click();

    const beforeImport = await page.evaluate(async () => {
      const response = await fetch('/api/workflows');
      const payload = await response.json();
      return {
        count: payload.data?.length,
        id: payload.data?.[0]?.id,
      };
    });
    const currentWorkflowId = beforeImport.id;
    expect(typeof currentWorkflowId).toBe('string');

    const importedWorkflow = {
      id: currentWorkflowId,
      name: '冲突导入工作流',
      version: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      nodes: [],
      edges: [],
      settings: {},
    };

    await page.locator('input[type="file"][accept=".json,application/json"]').setInputFiles({
      name: 'conflict-workflow.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(importedWorkflow), 'utf8'),
    });

    await expect(page.locator('.workflow-import-modal__dialog')).toBeVisible();
    await expect(page.getByText('已打开为新的未保存标签页。保存时会创建新的工作流记录。')).toBeVisible();
    await expect(page.getByText(/workflow\.id/)).toBeVisible();
    await expect(page.getByText('用其他方式重新导入')).toHaveCount(0);
    await expect(page.getByTestId('workflow-document-tabs')).toContainText('conflict-workflow *');

    const afterImport = await page.evaluate(async (originalId) => {
      const response = await fetch('/api/workflows');
      const payload = await response.json();
      return {
        count: payload.data?.length,
        originalCount: payload.data?.filter((workflow: { id: string }) => workflow.id === originalId).length,
      };
    }, currentWorkflowId);
    expect(afterImport).toEqual({ count: beforeImport.count, originalCount: 1 });

    await page.locator('.workflow-import-modal__button--primary').click();
    await page.getByRole('button', { name: '保存' }).click();
    await expect
      .poll(async () => {
        const response = await page.evaluate(async () => {
          const result = await fetch('/api/workflows');
          return result.json();
        });
        return response.data?.length;
      })
      .toBe((beforeImport.count || 0) + 1);
  });

  test('workflow toolbar can navigate back to settings', async ({ page }) => {
    await clearLocalState(page);

    await expect(page.getByTestId('workflow-page')).toBeVisible();

    await page.getByTestId('workflow-open-settings').click();
    await expect(page.getByTestId('settings-page')).toBeVisible();
  });

  test('workflow editing can undo a newly added node', async ({ page, browserName }) => {
    await clearLocalState(page);

    await expect(page.getByTestId('workflow-page')).toBeVisible();

    const beforeCount = await readStableNodeCount(page);

    await addTextInputNode(page);
    await expect(page.locator('.react-flow__node')).toHaveCount(beforeCount + 1);

    await page.waitForTimeout(300);
    await page.locator('[data-testid="workflow-page"]').click({ position: { x: 40, y: 40 } });
    await page.keyboard.press(browserName === 'webkit' ? 'Meta+Z' : 'Control+Z');
    await expect(page.locator('.react-flow__node')).toHaveCount(beforeCount);
  });

  test('settings connection test syncs models into import list', async ({ page }) => {
    const imageModelId = `gpt-image-1-import-fixture-${Date.now()}`;
    await clearLocalState(page);
    await openConnectionSettings(page);

    await page.route('**/api/settings/test-api', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            message: 'ok',
            models: ['gpt-4.1-mini', imageModelId],
            categorized: {
              chat: ['gpt-4.1-mini'],
              image: [imageModelId],
              video: [],
            },
          },
        }),
      });
    });

    await page.getByTestId('settings-base-url-field').locator('input').fill('https://provider.example/v1');
    await page.getByTestId('settings-api-key-field').locator('input').fill('sk-week10-test');
    await page.getByTestId('settings-provider-auth-type').selectOption('api-key');
    await page.getByTestId('settings-provider-models-endpoint').fill('/v1/models');

    await page.getByTestId('settings-test-connection').click();
    await page.getByTestId('settings-module-models').click();

    await expect(page.getByTestId('settings-importable-models-panel')).toBeVisible();
    await page.getByTestId(`settings-importable-model-${imageModelId}`).click();
    await page.getByTestId('settings-import-selected-models').click();

    await expect(page.getByTestId(`settings-project-model-card-${imageModelId}`)).toBeVisible();
  });

  test('settings connection failure shows visible feedback and does not import phantom models', async ({ page }) => {
    await clearLocalState(page);
    await openConnectionSettings(page);

    await page.route('**/api/settings/test-api', async (route) => {
      await route.fulfill({
        status: 502,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          error: {
            code: 'UPSTREAM_TIMEOUT',
            message: '上游连接超时',
          },
        }),
      });
    });

    await page.getByTestId('settings-base-url-field').locator('input').fill('https://provider.example/v1');
    await page.getByTestId('settings-api-key-field').locator('input').fill('sk-week15-failure');
    await page.getByTestId('settings-provider-auth-type').selectOption('api-key');
    await page.getByTestId('settings-provider-models-endpoint').fill('/v1/models');

    const failedConnection = page.waitForResponse(
      (response) => response.url().includes('/api/settings/test-api') && response.status() === 502,
    );
    await page.getByTestId('settings-test-connection').click();
    await failedConnection;

    await page.getByTestId('settings-module-diagnostics').click();
    await expect(page.getByTestId('settings-page')).toContainText('上游连接超时');
    await expect(page.getByTestId('settings-importable-models-panel')).toHaveCount(0);
    await expect(page.locator('[data-testid^="settings-project-model-card-"]')).toHaveCount(0);
  });


  test('settings exposes the reorganized primary modules', async ({ page }) => {
    await clearLocalState(page);
    await openSettings(page);
    for (const moduleId of ['overview', 'connection', 'models', 'workspace', 'diagnostics']) {
      await expect(page.getByTestId(`settings-module-${moduleId}`)).toBeVisible();
    }
    await expect(page.getByTestId('settings-module-agent')).toHaveCount(0);
    await expect(page.getByTestId('settings-module-account_details')).toHaveCount(0);
  });

});

test('资产库支持导入、整理、收藏、搜索和持久化回填', async ({ page }, testInfo) => {
  await clearLocalState(page);
  const initialNodes = await readStableNodeCount(page);
  const filename = `资产测试-${Date.now()}.png`;
  await page.getByTestId('workflow-open-assets').click();
  const dialog = page.getByRole('dialog', { name: '资产库', exact: true });
  await expect(dialog).toBeVisible();
  const panelBackgrounds = await dialog.locator('.asset-library__panel').evaluateAll((panels) =>
    panels.map((panel) => {
      const context = document.createElement('canvas').getContext('2d')!;
      context.fillStyle = getComputedStyle(panel).backgroundColor;
      context.fillRect(0, 0, 1, 1);
      return context.getImageData(0, 0, 1, 1).data[3];
    }),
  );
  expect(panelBackgrounds).toEqual([255, 255, 255, 255]);
  await dialog.getByTestId('asset-import').setInputFiles({ name: filename, mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64') });
  await expect(dialog.getByRole('status')).toContainText('已导入 1 个素材');
  await dialog.getByLabel('搜索资产', { exact: true }).fill(filename);
  await dialog.getByRole('button', { name: `查看 ${filename}`, exact: true }).click();
  await dialog.getByLabel('资产名称', { exact: true }).fill(`已整理-${filename}`);
  await dialog.getByLabel('编辑分类', { exact: true }).fill('测试参考');
  await dialog.getByLabel('资产标签', { exact: true }).fill('分镜，参考');
  await dialog.getByRole('button', { name: '保存整理信息' }).click();
  await expect(dialog.getByRole('status')).toHaveText('整理信息已保存');
  await dialog.getByRole('button', { name: `收藏 已整理-${filename}`, exact: true }).click();
  await expect(dialog.getByRole('button', { name: `取消收藏 已整理-${filename}`, exact: true })).toBeVisible();
  await page.reload();
  await page.getByTestId('workflow-open-assets').click();
  await dialog.getByLabel('搜索资产', { exact: true }).fill(`已整理-${filename}`);
  await dialog.getByRole('button', { name: '仅收藏', exact: true }).click();
  await dialog.getByLabel('资产分类', { exact: true }).selectOption('测试参考');
  await dialog.getByRole('button', { name: `查看 已整理-${filename}`, exact: true }).click();
  await expect(dialog.getByLabel('资产标签', { exact: true })).toHaveValue('分镜，参考');
  await expect.poll(() => dialog.locator('.asset-library__thumbnail img').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  await expect.poll(() => dialog.locator('.asset-library__preview img').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  await page.screenshot({ path: testInfo.outputPath('asset-library.png') });
  await dialog.getByRole('button', { name: '回填画布', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator('.react-flow__node')).toHaveCount(initialNodes + 1);
  await expect.poll(() => page.evaluate(() => {
    const draft = JSON.parse(localStorage.getItem('suelr-studio-local-draft') || '{}');
    return draft.nodes?.at(-1)?.data;
  })).toMatchObject({ content: [expect.stringMatching(/^\/api\/files\//)], _fileKinds: ['image'], _fileNames: [`已整理-${filename}`] });
  await page.reload();
  await expect(page.locator('.react-flow__node')).toHaveCount(initialNodes + 1);
  // Reopening the library should not create a duplicate upload during backfill.
  await page.getByTestId('workflow-open-assets').click();
  await dialog.getByLabel('搜索资产', { exact: true }).fill(filename);
  await expect(dialog.locator('.asset-library__card')).toHaveCount(1);
  await dialog.getByRole('button', { name: `查看 已整理-${filename}`, exact: true }).focus();
  await page.keyboard.press('Delete');
  await expect(page.locator('.react-flow__node')).toHaveCount(initialNodes + 1);
  await dialog.getByRole('button', { name: `查看 已整理-${filename}`, exact: true }).click();
  await dialog.getByRole('button', { name: '删除资产', exact: true }).click();
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  await expect(dialog.locator('.asset-library__card')).toHaveCount(1);
  await dialog.getByRole('button', { name: '删除资产', exact: true }).click();
  await dialog.getByRole('button', { name: '确认删除', exact: true }).click();
  await expect(dialog.getByRole('status')).toHaveText('已从资产库删除');
  await expect(dialog.getByText('选择一个资产')).toBeVisible();
  await expect(dialog.locator('.asset-library__card')).toHaveCount(0);
  await dialog.getByRole('button', { name: '刷新', exact: true }).click();
  await expect(dialog.locator('.asset-library__results')).toHaveAttribute('aria-busy', 'false');
  await expect(dialog.locator('.asset-library__card')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
});

test('资产库支持多选、批量编辑和批量删除', async ({ page }) => {
  await clearLocalState(page);
  const prefix = `批量资产-${Date.now()}`;
  const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
  await page.getByTestId('workflow-open-assets').click();
  const dialog = page.getByRole('dialog', { name: '资产库', exact: true });
  const cards = dialog.locator('.asset-library__card');
  await dialog.getByTestId('asset-import').setInputFiles([1, 2, 3].map((index) => ({
    name: `${prefix}-${index}.png`, mimeType: 'image/png', buffer: image,
  })));
  await expect(dialog.getByRole('status')).toHaveText('已导入 3 个素材');
  await dialog.getByRole('textbox', { name: '搜索资产' }).fill(prefix);
  await expect(cards).toHaveCount(3);
  await dialog.getByRole('button', { name: '多选', exact: true }).click();
  await dialog.getByRole('button', { name: '全选本页' }).click();
  await expect(dialog.getByText('本页已选 3 项')).toBeVisible();
  await dialog.getByRole('button', { name: `选择 ${prefix}-3.png` }).click();
  await dialog.getByRole('checkbox', { name: '修改分类' }).check();
  await dialog.getByRole('textbox', { name: '批量分类' }).fill(prefix);
  await dialog.getByRole('checkbox', { name: '替换标签' }).check();
  await dialog.getByRole('textbox', { name: '批量标签' }).fill('分镜，参考');
  await dialog.getByRole('button', { name: '保存批量编辑' }).click();
  await expect(dialog.getByRole('status')).toHaveText('已更新 2 个资产');
  await dialog.getByLabel('资产分类', { exact: true }).selectOption(prefix);
  await expect(cards).toHaveCount(2);
  await dialog.getByRole('button', { name: '全选本页' }).click();
  await dialog.getByRole('button', { name: '批量删除', exact: true }).click();
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  await expect(cards).toHaveCount(2);
  await dialog.getByRole('button', { name: '批量删除', exact: true }).click();
  await dialog.getByRole('button', { name: '确认批量删除' }).click();
  await expect(dialog.getByRole('status')).toHaveText('已从资产库删除 2 个资产');
  await dialog.getByLabel('资产分类', { exact: true }).selectOption('');
  await expect(cards).toHaveCount(1);
  await expect(dialog.getByRole('button', { name: `选择 ${prefix}-3.png` })).toBeVisible();
});
