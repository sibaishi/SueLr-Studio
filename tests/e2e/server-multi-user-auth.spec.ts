import { expect, test } from '@playwright/test';

test.describe('server multi user auth gate', () => {
  test('shows login gate before app and enters workspace after login', async ({ page }) => {
    let authenticated = false;
    const settingsRequests: string[] = [];
    await page.addInitScript(() => {
      window.localStorage.setItem('suelr_onboarding_dismissed', 'true');
    });

    await page.route('**/api/status', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: { ok: true, status: 'ok', version: 'test', timestamp: Date.now() },
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
            mode: 'server-multi-user',
            canSelectDirectory: false,
            canRestartBackend: false,
            hasEmbeddedShell: false,
            auth: {
              required: true,
              mode: 'session',
              user: authenticated
                ? {
                    id: 'user_e2e',
                    username: 'demo-user',
                    workspaceId: 'default',
                  }
                : null,
            },
          },
        }),
      });
    });
    await page.route('**/api/auth/login', async (route) => {
      const body = route.request().postDataJSON();
      authenticated = body.username === 'demo-user' && body.password === 'correct-password';
      await route.fulfill({
        status: authenticated ? 200 : 401,
        contentType: 'application/json',
        body: JSON.stringify(
          authenticated
            ? {
                success: true,
                data: {
                  user: { id: 'user_e2e', username: 'demo-user', workspaceId: 'default' },
                  session: { id: 'session_e2e', expiresAt: Date.now() + 60_000 },
                },
              }
            : {
                success: false,
                error: { code: 'AUTH_INVALID_CREDENTIALS', message: '用户名或密码无效', status: 401 },
              },
        ),
        headers: authenticated ? { 'set-cookie': 'suelr_session=session_e2e; HttpOnly; SameSite=Lax' } : {},
      });
    });
    await page.route('**/api/auth/logout', async (route) => {
      authenticated = false;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { ok: true } }),
        headers: { 'set-cookie': 'suelr_session=; Max-Age=0; Path=/' },
      });
    });
    await page.route('**/api/settings/studio', async (route) => {
      settingsRequests.push(route.request().method());
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            ui: {
              lastTab: 'workflow',
              sidebarCollapsed: false,
              theme: 'light',
            },
            runtime: {
              activeConfigId: 'default',
              configs: [],
            },
            workflow: {},
          },
        }),
      });
    });

    await page.goto('/');
    await expect(page.getByTestId('auth-login-gate')).toBeVisible();
    await expect(page.getByTestId('workflow-page')).toHaveCount(0);
    expect(settingsRequests).toEqual([]);

    await page.getByTestId('auth-login-username').fill('demo-user');
    await page.getByTestId('auth-login-password').fill('correct-password');
    await page.getByTestId('auth-login-submit').click();

    await expect(page.getByTestId('auth-login-gate')).toHaveCount(0);
    expect(settingsRequests).toContain('GET');
    expect(settingsRequests.filter((method) => method === 'POST')).toHaveLength(0);
    await expect(page.getByTestId('sidebar-logout')).toHaveCount(0);
    await page.getByTestId('nav-tab-workflow').click();
    await expect(page.getByTestId('workflow-page')).toBeVisible();
    await page.getByTestId('nav-tab-settings').click();
    await expect(page.getByTestId('settings-logout')).toBeVisible();
    await page.getByTestId('settings-logout').click();
    await expect(page.getByTestId('auth-login-gate')).toBeVisible();
    await expect(page.getByTestId('workflow-page')).toHaveCount(0);
  });

  test('keeps old browser state behind the login gate when server user is unknown', async ({ page }) => {
    const settingsRequests: string[] = [];
    await page.addInitScript(() => {
      window.localStorage.setItem('suelr_onboarding_dismissed', 'true');
      window.localStorage.setItem('ai_configs', JSON.stringify([{ id: 'legacy', base: 'https://legacy.invalid' }]));
      window.localStorage.setItem('workflow-draft', JSON.stringify({ nodes: [{ id: 'legacy-node' }] }));
    });

    await page.route('**/api/status', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: { ok: true, status: 'ok', version: 'test', timestamp: Date.now() },
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
            mode: 'server-multi-user',
            canSelectDirectory: false,
            canRestartBackend: false,
            hasEmbeddedShell: false,
            auth: {
              required: true,
              mode: 'session',
              user: null,
            },
          },
        }),
      });
    });
    await page.route('**/api/settings/studio', async (route) => {
      settingsRequests.push(route.request().method());
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          error: { code: 'UNEXPECTED_SETTINGS_REQUEST', message: 'unexpected', status: 500 },
        }),
      });
    });

    await page.goto('/');
    await expect(page.getByTestId('auth-login-gate')).toBeVisible();
    await expect(page.getByTestId('workflow-page')).toHaveCount(0);
    await expect(page.getByTestId('settings-page')).toHaveCount(0);
    expect(settingsRequests).toEqual([]);
  });

  test('blocks workspace when status succeeds but runtime capabilities fail', async ({ page }) => {
    const settingsRequests: string[] = [];
    await page.addInitScript(() => {
      window.localStorage.setItem('suelr_onboarding_dismissed', 'true');
    });

    await page.route('**/api/status', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: { ok: true, status: 'ok', version: 'test', timestamp: Date.now() },
        }),
      });
    });
    await page.route('**/api/capabilities/runtime', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          error: { code: 'RUNTIME_FAILED', message: 'runtime failed', status: 500 },
        }),
      });
    });
    await page.route('**/api/settings/studio', async (route) => {
      settingsRequests.push(route.request().method());
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          error: { code: 'UNEXPECTED_SETTINGS_REQUEST', message: 'unexpected', status: 500 },
        }),
      });
    });

    await page.goto('/');
    await expect(page.getByTestId('bootstrap-blocker')).toBeVisible();
    await expect(page.getByTestId('auth-login-gate')).toHaveCount(0);
    await expect(page.getByTestId('workflow-page')).toHaveCount(0);
    await expect(page.getByTestId('settings-page')).toHaveCount(0);
    expect(settingsRequests).toEqual([]);
  });

  test('submits registration request and shows pending approval state', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('suelr_onboarding_dismissed', 'true');
    });

    await page.route('**/api/status', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: { ok: true, status: 'ok', version: 'test', timestamp: Date.now() },
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
            mode: 'server-multi-user',
            canSelectDirectory: false,
            canRestartBackend: false,
            hasEmbeddedShell: false,
            auth: {
              required: true,
              mode: 'session',
              user: null,
            },
          },
        }),
      });
    });
    await page.route('**/api/auth/register', async (route) => {
      const body = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            user: {
              id: 'user_pending',
              username: body.username,
              email: body.email,
              status: 'pending',
              workspaceId: 'default',
            },
          },
        }),
      });
    });

    await page.goto('/');
    await page.getByTestId('auth-register-mode').click();
    await page.getByTestId('auth-login-username').fill('new-user');
    await page.getByTestId('auth-register-email').fill('new-user@example.com');
    await page.getByTestId('auth-login-password').fill('new-password-123');
    await page.getByTestId('auth-login-submit').click();

    await expect(page.getByTestId('auth-login-error')).toContainText('注册申请已提交');
    await expect(page.getByTestId('workflow-page')).toHaveCount(0);
  });

  test('server single user opens the app without login gate', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('suelr_onboarding_dismissed', 'true');
    });

    await page.route('**/api/status', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: { ok: true, status: 'ok', version: 'test', timestamp: Date.now() },
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
            auth: {
              required: false,
              mode: 'none',
              user: null,
            },
          },
        }),
      });
    });

    await page.goto('/');
    await expect(page.getByTestId('auth-login-gate')).toHaveCount(0);
    await page.getByTestId('nav-tab-workflow').click();
    await expect(page.getByTestId('workflow-page')).toBeVisible();
  });
});
