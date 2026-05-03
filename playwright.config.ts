import { defineConfig, devices } from '@playwright/test';

const backendPort = 3101;
const frontendPort = 4173;
const backendUrl = `http://127.0.0.1:${backendPort}`;
const frontendUrl = `http://127.0.0.1:${frontendPort}`;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  fullyParallel: false,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: frontendUrl,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'node server.js',
      cwd: './backend',
      url: `${backendUrl}/api/health`,
      reuseExistingServer: !process.env.CI,
      env: {
        APP_HOST: '127.0.0.1',
        APP_PORT: String(backendPort),
        APP_ALLOWED_ORIGINS: frontendUrl,
        APP_CONFIG_DIR: '.playwright/runtime',
      },
    },
    {
      command: 'cmd /c npm.cmd run dev:frontend -- --host 127.0.0.1 --port 4173',
      cwd: '.',
      url: frontendUrl,
      reuseExistingServer: !process.env.CI,
      env: {
        VITE_DEV_PROXY_TARGET: backendUrl,
      },
    },
  ],
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
