import { expect, test } from '@playwright/test';

test.describe('server multi user auth gate', () => {
  test('shows login gate before app and enters workspace after login', async ({ page }) => {
    let authenticated = false;
    await page.addInitScript(() => {
      window.localStorage.setItem('suelr_onboarding_dismissed', 'true');
    });

    await page.route('**/api/health', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: { status: 'ok', version: 'test', timestamp: Date.now() },
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
    await page.route('**/api/settings/studio', async (route) => {
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

    await page.getByTestId('auth-login-username').fill('demo-user');
    await page.getByTestId('auth-login-password').fill('correct-password');
    await page.getByTestId('auth-login-submit').click();

    await expect(page.getByTestId('auth-login-gate')).toHaveCount(0);
    await page.getByTestId('nav-tab-workflow').click();
    await expect(page.getByTestId('workflow-page')).toBeVisible();
  });

  test('submits registration request and shows pending approval state', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('suelr_onboarding_dismissed', 'true');
    });

    await page.route('**/api/health', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: { status: 'ok', version: 'test', timestamp: Date.now() },
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

    await page.route('**/api/health', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: { status: 'ok', version: 'test', timestamp: Date.now() },
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
