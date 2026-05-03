import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';

function createStorageDir(name) {
  const root = path.resolve('C:/Users/ADMINI~1.WIN/AppData/Local/Temp/opencode', `phase2-${name}-${Date.now()}`);
  fs.mkdirSync(root, { recursive: true });
  return root;
}

test('settings service reads and updates studio settings', async () => {
  process.env.APP_STORAGE_DIR = createStorageDir('settings');

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
});

test('settings response does not expose secrets in plaintext', async () => {
  process.env.APP_STORAGE_DIR = createStorageDir('settings-response');

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
  assert.equal(response.activeConfig.apiKey, '');
  assert.equal(response.activeConfig.apiKeySet, true);
});

test('settings module sanitizes provider config without legacy route dependency', async () => {
  process.env.APP_STORAGE_DIR = createStorageDir('settings-provider-config');

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
