// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { ConflictError } from '../src/app/errors/app-error.ts';

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

  const { settingsService } = await import(`../src/modules/settings/settings.service.ts?test=${Date.now()}`);

  const initial = settingsService.getStudioSettings();
  assert.equal(initial.ui.theme, 'dark');
  assert.deepEqual(initial.workflow.concurrency, {
    enabled: false,
    maxConcurrency: 5,
  });

  const updated = settingsService.updateStudioSettings({
    ui: { theme: 'light' },
    runtime: {
      tavilyApiKey: 'demo-key',
    },
    workflow: {
      concurrency: {
        enabled: true,
        maxConcurrency: 12,
      },
    },
  });

  assert.equal(updated.ui.theme, 'light');
  assert.equal(updated.runtime.tavilyApiKey, 'demo-key');
  assert.deepEqual(updated.workflow.concurrency, {
    enabled: true,
    maxConcurrency: 12,
  });
  assert.deepEqual(settingsService.buildRuntimeConfig().workflowExecution, {
    enabled: true,
    maxConcurrency: 12,
  });
  assert.deepEqual(updated.runtime.outboundProxy, {
    mode: 'system',
    httpProxy: '',
    httpsProxy: '',
    noProxy: '',
  });
  assert.equal(updated.runtime.configs[0]?.apiKey, '');
  assert.equal(updated.runtime.configs[0]?.apiKeySet, false);
});

test('studio settings response redacts provider secrets but preserves them on empty apiKey patch', async () => {
  const root = createStorageDir('studio-settings-redaction');
  process.env.APP_CONFIG_DIR = root;
  process.env.APP_STORAGE_BOOTSTRAP_FILE = path.join(root, 'config', 'bootstrap.json');
  process.env.APP_DISABLE_LEGACY_STORAGE_MIGRATION = '1';

  const { settingsService } = await import(`../src/modules/settings/settings.service.ts?test=${Date.now()}`);

  settingsService.updateStudioSettings({
    runtime: {
      activeConfigId: 'default',
      configs: [{ id: 'default', name: 'Primary', base: 'https://api.openai.com/v1', apiKey: 'sk-secret', models: [] }],
    },
  });

  const redacted = settingsService.getStudioSettings();
  assert.equal(redacted.runtime.configs[0]?.apiKey, '');
  assert.equal(redacted.runtime.configs[0]?.apiKeySet, true);

  settingsService.updateStudioSettings({
    runtime: {
      activeConfigId: 'default',
      configs: [{ id: 'default', name: 'Renamed', base: 'https://api.openai.com/v1', apiKey: '', models: [] }],
    },
  });

  const runtimeConfig = settingsService.buildRuntimeConfig({ configId: 'default' });
  assert.equal(runtimeConfig.apiKey, 'sk-secret');

  const roundTrip = settingsService.getStudioSettings();
  assert.equal(roundTrip.runtime.configs[0]?.name, 'Renamed');
  assert.equal(roundTrip.runtime.configs[0]?.apiKey, '');
  assert.equal(roundTrip.runtime.configs[0]?.apiKeySet, true);
});

test('settings response does not expose secrets in plaintext', async () => {
  const root = createStorageDir('settings-response');
  process.env.APP_CONFIG_DIR = root;
  process.env.APP_STORAGE_BOOTSTRAP_FILE = path.join(root, 'config', 'bootstrap.json');
  process.env.APP_DISABLE_LEGACY_STORAGE_MIGRATION = '1';

  const { settingsService } = await import(`../src/modules/settings/settings.service.ts?test=${Date.now()}`);
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
  assert.equal(response.runtime.outboundProxy, undefined);
  assert.equal(response.activeConfig.apiKey, '');
  assert.equal(response.activeConfig.apiKeySet, true);
});

test('settings service discovers models with stored secrets when configId is provided', async () => {
  const root = createStorageDir('settings-discover-stored-secret');
  process.env.APP_CONFIG_DIR = root;
  process.env.APP_STORAGE_BOOTSTRAP_FILE = path.join(root, 'config', 'bootstrap.json');
  process.env.APP_DISABLE_LEGACY_STORAGE_MIGRATION = '1';

  const { settingsService } = await import(`../src/modules/settings/settings.service.ts?test=${Date.now()}`);
  settingsService.updateStudioSettings({
    runtime: {
      activeConfigId: 'default',
      configs: [{ id: 'default', name: 'Stored', base: 'https://api.openai.com/v1', apiKey: 'sk-stored', models: [] }],
    },
  });

  const originalFetchModelsFromProvider = settingsService.repository.fetchModelsFromProvider;
  try {
    settingsService.repository.fetchModelsFromProvider = async (runtimeConfig) => {
      assert.equal(runtimeConfig.configId, 'default');
      assert.equal(runtimeConfig.apiKey, 'sk-stored');
      return { all: ['gpt-5.5'], chat: ['gpt-5.5'], image: [], video: [] };
    };

    const result = await settingsService.discoverModels({
      configId: 'default',
      apiKey: 'use-stored',
      baseUrl: 'https://api.openai.com/v1',
    });

    assert.deepEqual(result.models, { all: ['gpt-5.5'], chat: ['gpt-5.5'], image: [], video: [] });
  } finally {
    settingsService.repository.fetchModelsFromProvider = originalFetchModelsFromProvider;
  }
});

test('studio settings no longer exposes legacy outbound proxy settings', async () => {
  const root = createStorageDir('settings-outbound-proxy');
  process.env.APP_CONFIG_DIR = root;
  process.env.APP_STORAGE_BOOTSTRAP_FILE = path.join(root, 'config', 'bootstrap.json');
  process.env.APP_DISABLE_LEGACY_STORAGE_MIGRATION = '1';

  const { settingsService } = await import(`../src/modules/settings/settings.service.ts?test=${Date.now()}`);
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
  assert.equal(response.runtime.outboundProxy, undefined);
});

test('runtime config inherits app outbound proxy until studio settings explicitly override it', async () => {
  const root = createStorageDir('settings-app-proxy-source');
  process.env.APP_CONFIG_DIR = root;
  process.env.APP_STORAGE_BOOTSTRAP_FILE = path.join(root, 'config', 'bootstrap.json');
  process.env.APP_DISABLE_LEGACY_STORAGE_MIGRATION = '1';

  const { settingsService } = await import(`../src/modules/settings/settings.service.ts?test=${Date.now()}`);
  const { appConfigRepository } = await import(`../src/modules/app-config/app-config.repository.ts?test=${Date.now()}`);

  settingsService.updateStudioSettings({
    runtime: {
      outboundProxy: {
        mode: 'system',
        httpProxy: '',
        httpsProxy: '',
        noProxy: '',
      },
    },
  });
  appConfigRepository.updateAppConfig({
    network: {
      outboundProxy: {
        mode: 'custom',
        httpProxy: '127.0.0.1:7890',
        httpsProxy: 'http://127.0.0.1:7897',
        noProxy: 'localhost',
      },
    },
  });

  assert.deepEqual(settingsService.buildRuntimeConfig().outboundProxy, {
    mode: 'custom',
    httpProxy: '127.0.0.1:7890',
    httpsProxy: 'http://127.0.0.1:7897',
    noProxy: 'localhost',
  });

  settingsService.updateStudioSettings({
    runtime: {
      outboundProxy: {
        mode: 'direct',
        httpProxy: '',
        httpsProxy: '',
        noProxy: '',
      },
    },
  });

  assert.deepEqual(settingsService.buildRuntimeConfig().outboundProxy, {
    mode: 'direct',
    httpProxy: '',
    httpsProxy: '',
    noProxy: '',
  });
});

test('settings module sanitizes provider config without legacy route dependency', async () => {
  const root = createStorageDir('settings-provider-config');
  process.env.APP_CONFIG_DIR = root;
  process.env.APP_STORAGE_BOOTSTRAP_FILE = path.join(root, 'config', 'bootstrap.json');
  process.env.APP_DISABLE_LEGACY_STORAGE_MIGRATION = '1';

  const { settingsService } = await import(`../src/modules/settings/settings.service.ts?test=${Date.now()}`);

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

test('settings repository filters unavailable provider models from discovery', async () => {
  const root = createStorageDir('settings-model-discovery');
  process.env.APP_CONFIG_DIR = root;
  process.env.APP_STORAGE_BOOTSTRAP_FILE = path.join(root, 'config', 'bootstrap.json');
  process.env.APP_DISABLE_LEGACY_STORAGE_MIGRATION = '1';

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    async json() {
      return {
        data: [
          { id: 'doubao-vision-pro-32k-241028', status: 'Shutdown', domain: 'VLM' },
          { id: 'doubao-seed-1-6-250615', domain: 'LLM' },
          { id: 'doubao-seedream-4-0-250828', domain: 'ImageGeneration' },
          { id: 'doubao-seedance-2-0-260128', domain: 'VideoGeneration' },
          { id: 'doubao-embedding-large-text-250515', domain: 'Embedding' },
          { id: 'hyper3d-gen2-260112', domain: '3DGeneration' },
        ],
      };
    },
  });

  try {
    const { settingsRepository } = await import(`../src/modules/settings/settings.repository.ts?test=${Date.now()}`);
    const models = await settingsRepository.fetchModelsFromProvider({
      apiKey: 'demo-key',
      baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
      providerConfig: {
        authType: 'bearer',
        modelsEndpoint: '/v1/models',
        modelOverrides: {},
      },
    });

    assert.equal(models.all.includes('doubao-vision-pro-32k-241028'), false);
    assert.equal(models.all.includes('doubao-embedding-large-text-250515'), false);
    assert.equal(models.all.includes('hyper3d-gen2-260112'), false);
    assert.equal(models.chat.includes('doubao-seed-1-6-250615'), true);
    assert.equal(models.image.includes('doubao-seedream-4-0-250828'), true);
    assert.equal(models.video.includes('doubao-seedance-2-0-260128'), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('settings service blocks backend restart while project is busy', async () => {
  const root = createStorageDir('settings-restart-busy');
  process.env.APP_CONFIG_DIR = root;
  process.env.APP_STORAGE_BOOTSTRAP_FILE = path.join(root, 'config', 'bootstrap.json');
  process.env.APP_DISABLE_LEGACY_STORAGE_MIGRATION = '1';

  const { SettingsService } = await import(`../src/modules/settings/settings.service.ts?test=${Date.now()}`);
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

  const { SettingsService } = await import(`../src/modules/settings/settings.service.ts?test=${Date.now()}`);
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

