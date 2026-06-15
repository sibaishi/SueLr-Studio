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

  test('workflow can save and reload a created workflow', async ({ page }) => {
    const workflowName = `E2E Workflow Save ${Date.now().toString(36)}`;

    await clearLocalState(page);

    await expect(page.getByTestId('workflow-page')).toBeVisible();

    await page.getByTestId('workflow-new').click();
    await page.getByTestId('workflow-name-input').fill(workflowName);
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
    await expect(page.getByTestId('workflow-name-input')).toHaveValue(workflowName);
    await expect(page.locator('.react-flow__node')).toHaveCount(expectedNodeCount);
  });

  test('workflow can duplicate and delete a saved workflow', async ({ page }) => {
    const workflowName = `E2E Workflow Duplicate ${Date.now().toString(36)}`;

    await clearLocalState(page);

    await expect(page.getByTestId('workflow-page')).toBeVisible();

    await page.getByTestId('workflow-new').click();
    await page.getByTestId('workflow-name-input').fill(workflowName);
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
    await expect(page.getByTestId('workflow-name-input')).toHaveValue((duplicated as { name: string }).name);

    page.once('dialog', async (dialog) => {
      await dialog.accept();
    });
    await page.getByTestId('workflow-delete').click();

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
            models: ['gpt-4.1-mini', 'gpt-image-1'],
            categorized: {
              chat: ['gpt-4.1-mini'],
              image: ['gpt-image-1'],
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
    await page.getByTestId('settings-importable-model-gpt-image-1').click();
    await page.getByTestId('settings-import-selected-models').click();

    await expect(page.getByTestId('settings-project-model-card-gpt-image-1')).toBeVisible();
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
    await expect(page.getByTestId('settings-module-overview')).toBeVisible();
    await expect(page.getByTestId('settings-module-agent')).toBeVisible();
    await expect(page.getByTestId('settings-module-workspace')).toBeVisible();
    await expect(page.getByTestId('settings-module-account_details')).toHaveCount(0);
  });

});
