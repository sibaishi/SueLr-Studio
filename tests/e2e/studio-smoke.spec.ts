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

  const settingsTab = page.getByTestId('nav-tab-settings');
  if (await settingsTab.isVisible({ timeout: 10_000 }).catch(() => false)) {
    await settingsTab.click();
  }

  await expect(page.getByTestId('settings-page')).toBeVisible();
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
  const nodeCount = page.getByTestId('workflow-node-count').locator('strong');
  await expect
    .poll(
      async () => {
        const first = Number((await nodeCount.textContent()) || '0');
        await page.waitForTimeout(250);
        const second = Number((await nodeCount.textContent()) || '0');
        return first === second ? second : Number.NaN;
      },
      {
        timeout: 5_000,
        intervals: [250, 500],
      },
    )
    .not.toBeNaN();
  return Number((await nodeCount.textContent()) || '0');
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
    await expect(page.locator('body')).toContainText('release/server-web');
  });

  test('settings fields persist after reload', async ({ page }) => {
    const seed = Date.now().toString(36);
    const configName = `E2E Config ${seed}`;
    const baseUrl = `https://example-${seed}.test/v1`;
    const apiKey = `sk-e2e-${seed}`;

    await clearLocalState(page);
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

    await expect(configNameInput).toHaveValue(configName);
    await expect(baseUrlInput).toHaveValue(baseUrl);
    await expect(apiKeyInput).toHaveValue('');
  });

  test('workflow can add a node from the sidebar', async ({ page }) => {
    await clearLocalState(page);

    await page.getByTestId('nav-tab-workflow').click();
    await expect(page.getByTestId('workflow-page')).toBeVisible();

    const nodeCount = page.getByTestId('workflow-node-count').locator('strong');
    const beforeCount = await readStableNodeCount(page);

    await page.getByTestId('workflow-node-item-textInput').click();

    await expect(nodeCount).toHaveText(String(beforeCount + 1));
  });

  test('workflow can save and reload a created workflow', async ({ page }) => {
    const workflowName = `E2E Workflow Save ${Date.now().toString(36)}`;

    await clearLocalState(page);

    await page.getByTestId('nav-tab-workflow').click();
    await expect(page.getByTestId('workflow-page')).toBeVisible();

    await page.getByTestId('workflow-new').click();
    await page.getByTestId('workflow-name-input').fill(workflowName);
    const beforeCount = await readStableNodeCount(page);
    await page.getByTestId('workflow-node-item-textInput').click();
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
    await expect(page.getByTestId('workflow-node-count').locator('strong')).toHaveText(String(expectedNodeCount));
  });

  test('workflow can duplicate and delete a saved workflow', async ({ page }) => {
    const workflowName = `E2E Workflow Duplicate ${Date.now().toString(36)}`;

    await clearLocalState(page);

    await page.getByTestId('nav-tab-workflow').click();
    await expect(page.getByTestId('workflow-page')).toBeVisible();

    await page.getByTestId('workflow-new').click();
    await page.getByTestId('workflow-name-input').fill(workflowName);
    await page.getByTestId('workflow-node-item-textInput').click();
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

  test('workflow import report explains retry handling modes after id rewrite', async ({ page }) => {
    await clearLocalState(page);

    await page.getByTestId('nav-tab-workflow').click();
    await expect(page.getByTestId('workflow-page')).toBeVisible();

    await page.getByTestId('workflow-node-item-textInput').click();
    await page.getByRole('button', { name: '保存' }).click();

    const currentWorkflowId = await page.evaluate(async () => {
      const response = await fetch('/api/workflows');
      const payload = await response.json();
      return payload.data?.[0]?.id;
    });
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
    await expect(page.getByText('导入已完成。下面列出版本迁移、提示和被忽略字段。')).toBeVisible();
    await expect(page.getByText(/workflow\.id/)).toBeVisible();
    await expect(page.getByText('用其他方式重新导入')).toBeVisible();
    await expect(page.getByRole('button', { name: /生成新 ID/ })).toContainText('保留现有工作流不变');
    await expect(page.getByRole('button', { name: /覆盖现有工作流/ })).toContainText('替换当前同 ID 工作流');
  });

  test('workflow toolbar can navigate back to settings', async ({ page }) => {
    await clearLocalState(page);

    await page.getByTestId('nav-tab-workflow').click();
    await expect(page.getByTestId('workflow-page')).toBeVisible();

    await page.getByTestId('workflow-open-settings').click();
    await expect(page.getByTestId('settings-page')).toBeVisible();
  });

  test('workflow editing can undo a newly added node', async ({ page, browserName }) => {
    await clearLocalState(page);

    await page.getByTestId('nav-tab-workflow').click();
    await expect(page.getByTestId('workflow-page')).toBeVisible();

    const nodeCount = page.getByTestId('workflow-node-count').locator('strong');
    const beforeCount = await readStableNodeCount(page);

    await page.getByTestId('workflow-node-item-textInput').click();
    await expect(nodeCount).toHaveText(String(beforeCount + 1));

    await page.waitForTimeout(300);
    await page.locator('[data-testid="workflow-page"]').click({ position: { x: 40, y: 40 } });
    await page.keyboard.press(browserName === 'webkit' ? 'Meta+Z' : 'Control+Z');
    await expect(nodeCount).toHaveText(String(beforeCount));
  });

  test('settings connection test syncs models into import list', async ({ page }) => {
    await clearLocalState(page);

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

    await page.getByTestId('settings-test-connection').click();

    await expect(page.locator('text=ERROR')).toBeVisible();
    await expect(page.getByTestId('settings-importable-models-panel')).toHaveCount(0);
    await expect(page.locator('[data-testid^="settings-project-model-card-"]')).toHaveCount(0);
  });

  test('settings keeps browser download path entry in server runtime mode', async ({ page }) => {
    await clearLocalState(page);

    await page.route('**/api/status', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            ok: true,
            version: 'test',
            runtime: {
              mode: 'server-single-user',
              canSelectDirectory: false,
              canRestartBackend: false,
              hasEmbeddedShell: false,
            },
          },
        }),
      });
    });
    await page.route('**/api/capabilities/runtime', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            mode: 'server-single-user',
            canSelectDirectory: false,
            canRestartBackend: false,
            hasEmbeddedShell: false,
          },
        }),
      });
    });
    await page.route('**/api/settings/storage', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              effectiveRoot: '[server-managed]',
              defaultRoot: '[server-managed]',
              customRoot: '',
              source: 'default',
              restartRequired: false,
              envOverride: '',
              legacyRoot: '',
              pathsRedacted: true,
              canManagePath: false,
            },
          }),
        });
        return;
      }

      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          error: {
            code: 'STORAGE_PATH_MANAGEMENT_UNAVAILABLE',
            message: '当前运行模式不支持修改存储路径',
          },
        }),
      });
    });

    await page.goto('/');
    await expect(page.locator('.splash-overlay')).toHaveCount(0);
    await expect(page.getByTestId('settings-module-account_details')).toHaveCount(0);
    await page.getByTestId('settings-module-defaults').click();

    await expect(page.getByTestId('settings-runtime-storage-mode')).toContainText('服务器单用户');
    await expect(page.getByTestId('settings-storage-effective-root')).toContainText('未设置浏览器自动下载目录');
    await expect(page.getByTestId('settings-pick-storage-path')).toBeEnabled();
    await expect(page.getByTestId('settings-save-storage-path')).toBeEnabled();
    await expect(page.getByTestId('settings-reset-storage-path')).toBeEnabled();
    await expect(page.getByTestId('settings-restart-backend')).toHaveCount(0);
    await expect(page.getByTestId('settings-restart-backend-hint')).toHaveCount(0);

    await page.getByTestId('settings-module-diagnostics').click();
    await expect(page.getByTestId('settings-runtime-diagnostics')).toContainText('server-single-user');
    await expect(page.getByTestId('settings-capability-select-directory')).toContainText('禁用');
    await expect(page.getByTestId('settings-capability-restart-backend')).toContainText('禁用');
  });

  test('settings keeps account details module in local runtime mode', async ({ page }) => {
    await clearLocalState(page);
    await expect(page.getByTestId('settings-module-account_details')).toBeVisible();
  });

  test('workflow saveFile node switches to browser download authorization in server runtime mode', async ({ page }) => {
    await clearLocalState(page);

    await page.route('**/api/status', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            ok: true,
            version: 'test',
            runtime: {
              mode: 'server-single-user',
              canSelectDirectory: false,
              canRestartBackend: false,
              hasEmbeddedShell: false,
            },
          },
        }),
      });
    });
    await page.route('**/api/capabilities/runtime', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            mode: 'server-single-user',
            canSelectDirectory: false,
            canRestartBackend: false,
            hasEmbeddedShell: false,
          },
        }),
      });
    });

    await page.goto('/');
    await expect(page.locator('.splash-overlay')).toHaveCount(0);
    await page.getByTestId('nav-tab-workflow').click();
    await expect(page.getByTestId('workflow-page')).toBeVisible();

    await page.getByTestId('workflow-node-item-saveFile').click();

    const pickerButton = page.locator('.node-param__picker-button').filter({ hasText: '授权下载目录' }).first();
    await expect(pickerButton).toBeEnabled();
    await expect(page.locator('.node-param__hint').filter({ hasText: 'server-web 下这里用于授权当前浏览器的自动下载目录' }).first()).toBeVisible();
  });
  test('server runtime results panel can clear retained server outputs with confirmation', async ({ page }) => {
    await clearLocalState(page);

    await page.route('**/api/status', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            ok: true,
            version: 'test',
            runtime: {
              mode: 'server-single-user',
              canSelectDirectory: false,
              canRestartBackend: false,
              hasEmbeddedShell: false,
            },
          },
        }),
      });
    });
    await page.route('**/api/capabilities/runtime', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            mode: 'server-single-user',
            canSelectDirectory: false,
            canRestartBackend: false,
            hasEmbeddedShell: false,
          },
        }),
      });
    });

    let generatedOutputsCleared = false;
    await page.route('**/api/files/generated', async (route) => {
      if (route.request().method() === 'DELETE') {
        generatedOutputsCleared = true;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: { removed: 1 },
          }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: generatedOutputsCleared ? [] : [{
            id: 'images/demo-output.jpg',
            name: 'demo-output.jpg',
            relativePath: 'images/demo-output.jpg',
            url: '/api/outputs/images/demo-output.jpg',
            thumbnailUrl: '/api/outputs/images/.thumbnails/demo-output__thumb.jpg',
            type: 'image',
            mimeType: 'image/jpeg',
            width: 1024,
            height: 1024,
            size: 123456,
            modifiedAt: Date.now(),
          }],
        }),
      });
    });

    page.on('dialog', async (dialog) => {
      await dialog.accept();
    });

    await page.goto('/');
    await expect(page.locator('.splash-overlay')).toHaveCount(0);
    await page.getByTestId('nav-tab-workflow').click();
    await expect(page.getByTestId('workflow-page')).toBeVisible();

    await expect(page.getByRole('button', { name: '清空服务器结果' })).toBeVisible();
    await page.getByRole('button', { name: '清空服务器结果' }).click();

    await expect.poll(() => generatedOutputsCleared).toBe(true);
    await expect(page.locator('text=还没有 AI 输出')).toBeVisible();
  });
});
