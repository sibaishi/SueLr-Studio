import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { ConflictError } from '../src/app/errors/app-error.js';

function createStorageDir(name) {
  const root = path.resolve('C:/Users/ADMINI~1.WIN/AppData/Local/Temp/opencode', `phase2-${name}-${Date.now()}`);
  fs.mkdirSync(root, { recursive: true });
  return root;
}

test('settings service reads and updates studio settings', async () => {
  const root = createStorageDir('settings');
  process.env.APP_CONFIG_DIR = root;
  process.env.APP_STORAGE_BOOTSTRAP_FILE = path.join(root, 'config', 'bootstrap.json');
  process.env.APP_DISABLE_LEGACY_STORAGE_MIGRATION = '1';

  const { settingsService } = await import(`../src/modules/settings/settings.service.js?test=${Date.now()}`);

  const initial = settingsService.getStudioSettings();
  assert.equal(initial.ui.theme, 'dark');

  const updated = settingsService.updateStudioSettings({
    ui: { theme: 'light' },
    runtime: {
      tavilyApiKey: 'demo-key',
    },
  });

  assert.equal(updated.ui.theme, 'light');
  assert.equal(updated.runtime.tavilyApiKey, 'demo-key');
  assert.deepEqual(updated.runtime.outboundProxy, {
    mode: 'system',
    httpProxy: '',
    httpsProxy: '',
    noProxy: '',
  });
});

test('settings response does not expose secrets in plaintext', async () => {
  const root = createStorageDir('settings-response');
  process.env.APP_CONFIG_DIR = root;
  process.env.APP_STORAGE_BOOTSTRAP_FILE = path.join(root, 'config', 'bootstrap.json');
  process.env.APP_DISABLE_LEGACY_STORAGE_MIGRATION = '1';

  const { settingsService } = await import(`../src/modules/settings/settings.service.js?test=${Date.now()}`);
  settingsService.updateStudioSettings({
    runtime: {
      activeConfigId: 'default',
      tavilyApiKey: 'tvly-secret',
      configs: [{ id: 'default', name: 'Default', base: 'https://api.openai.com/v1', apiKey: 'sk-secret', models: [] }],
    },
  });

  const response = settingsService.getSettingsResponse();
  assert.equal(response.apiKeySet, true);
  assert.equal(response.apiKey, undefined);
  assert.equal(response.tavilyApiKey, undefined);
  assert.equal(response.tavilyApiKeySet, true);
  assert.deepEqual(response.runtime.outboundProxy, {
    mode: 'system',
    httpProxySet: false,
    httpsProxySet: false,
    noProxy: '',
  });
  assert.equal(response.activeConfig.apiKey, '');
  assert.equal(response.activeConfig.apiKeySet, true);
});

test('settings service persists outbound proxy settings without exposing proxy URLs publicly', async () => {
  const root = createStorageDir('settings-outbound-proxy');
  process.env.APP_CONFIG_DIR = root;
  process.env.APP_STORAGE_BOOTSTRAP_FILE = path.join(root, 'config', 'bootstrap.json');
  process.env.APP_DISABLE_LEGACY_STORAGE_MIGRATION = '1';

  const { settingsService } = await import(`../src/modules/settings/settings.service.js?test=${Date.now()}`);
  const updated = settingsService.updateStudioSettings({
    runtime: {
      outboundProxy: {
        mode: 'custom',
        httpProxy: '127.0.0.1:7890',
        httpsProxy: 'http://127.0.0.1:7897',
        noProxy: 'localhost,*.internal',
      },
    },
  });

  assert.deepEqual(updated.runtime.outboundProxy, {
    mode: 'custom',
    httpProxy: '127.0.0.1:7890',
    httpsProxy: 'http://127.0.0.1:7897',
    noProxy: 'localhost,*.internal',
  });

  const response = settingsService.getSettingsResponse();
  assert.deepEqual(response.runtime.outboundProxy, {
    mode: 'custom',
    httpProxySet: true,
    httpsProxySet: true,
    noProxy: 'localhost,*.internal',
  });
});

test('settings module sanitizes provider config without legacy route dependency', async () => {
  const root = createStorageDir('settings-provider-config');
  process.env.APP_CONFIG_DIR = root;
  process.env.APP_STORAGE_BOOTSTRAP_FILE = path.join(root, 'config', 'bootstrap.json');
  process.env.APP_DISABLE_LEGACY_STORAGE_MIGRATION = '1';

  const { settingsService } = await import(`../src/modules/settings/settings.service.js?test=${Date.now()}`);

  const updated = settingsService.updateRuntimeConfig({
    providerConfig: {
      imageTimeoutMs: '4200.2',
      modelOverrides: {
        '  image-model  ': { type: 'image', endpoint: ' /custom-image ' },
        'bad-model': { type: 'invalid' },
      },
    },
  });

  assert.equal(updated.activeConfig.providerConfig.imageTimeoutMs, 4200);
  assert.deepEqual(updated.activeConfig.providerConfig.modelOverrides, {
    'image-model': { type: 'image', endpoint: '/custom-image' },
  });
  assert.equal(updated.activeConfig.providerConfig.imageEndpoint, '/v1/images/generations');
});

test('settings service blocks backend restart while project is busy', async () => {
  const root = createStorageDir('settings-restart-busy');
  process.env.APP_CONFIG_DIR = root;
  process.env.APP_STORAGE_BOOTSTRAP_FILE = path.join(root, 'config', 'bootstrap.json');
  process.env.APP_DISABLE_LEGACY_STORAGE_MIGRATION = '1';

  const { SettingsService } = await import(`../src/modules/settings/settings.service.js?test=${Date.now()}`);
  const service = new SettingsService(undefined, {
    executionService: { runningExecutions: new Set(['run-1']) },
    restartBackend: async () => ({ mode: 'watch' }),
  });

  await assert.rejects(() => service.requestBackendRestart(), (error) => {
    assert.ok(error instanceof ConflictError);
    assert.equal(error.code, 'PROJECT_BUSY');
    assert.equal(error.message, '项目正在运行中，请稍后再试');
    return true;
  });
});

test('settings service requests backend restart when project is idle', async () => {
  const root = createStorageDir('settings-restart-idle');
  process.env.APP_CONFIG_DIR = root;
  process.env.APP_STORAGE_BOOTSTRAP_FILE = path.join(root, 'config', 'bootstrap.json');
  process.env.APP_DISABLE_LEGACY_STORAGE_MIGRATION = '1';

  const { SettingsService } = await import(`../src/modules/settings/settings.service.js?test=${Date.now()}`);
  let called = false;
  const service = new SettingsService(undefined, {
    executionService: { runningExecutions: new Set() },
    restartBackend: async () => {
      called = true;
      return { mode: 'spawn' };
    },
  });

  const result = await service.requestBackendRestart();
  assert.equal(called, true);
  assert.deepEqual(result, { mode: 'spawn' });
});
