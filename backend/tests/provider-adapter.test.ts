// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';

import { getProviderAdapter } from '../src/platform/providers/index.ts';
import { assertSafeProviderBaseUrl, assertSafeRemoteDownloadUrl } from '../src/platform/security/network-guards.ts';

test('provider adapter builds compatible endpoint and headers', () => {
  const adapter = getProviderAdapter();

  const request = adapter.buildJsonRequest({
    apiKey: 'demo-key',
    providerConfig: { authType: 'bearer' },
    baseUrl: 'https://api.openai.com/v1/',
    endpoint: '/v1/chat/completions',
    body: { hello: 'world' },
  });

  assert.equal(request.url, 'https://api.openai.com/v1/chat/completions');
  assert.equal(request.options.method, 'POST');
  assert.equal(request.options.headers.Authorization, 'Bearer demo-key');
  assert.equal(request.options.body, JSON.stringify({ hello: 'world' }));
});

test('provider adapter replaces base API version when endpoint uses beta version segment', () => {
  const adapter = getProviderAdapter();

  const request = adapter.buildJsonRequest({
    apiKey: 'demo-key',
    providerConfig: { authType: 'bearer' },
    baseUrl: 'https://www.6789api.top/v1',
    endpoint: '/v1beta/models/gemini-2.5-flash-image:generateContent',
    body: { contents: [] },
  });

  assert.equal(request.url, 'https://www.6789api.top/v1beta/models/gemini-2.5-flash-image:generateContent');
});

test('provider adapter keeps API gateway prefix when base URL already includes api version', () => {
  const adapter = getProviderAdapter();

  const request = adapter.buildJsonRequest({
    apiKey: 'demo-key',
    providerConfig: { authType: 'bearer' },
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    endpoint: '/v1/chat/completions',
    body: { model: 'ep-demo' },
  });

  assert.equal(request.url, 'https://ark.cn-beijing.volces.com/api/v3/chat/completions');
});

test('provider adapter accepts endpoint paths without a leading slash', () => {
  const adapter = getProviderAdapter();

  const request = adapter.buildJsonRequest({
    apiKey: 'demo-key',
    providerConfig: { authType: 'bearer' },
    baseUrl: 'https://api.openai.com/v1',
    endpoint: 'chat/completions',
    body: { model: 'demo' },
  });

  assert.equal(request.url, 'https://api.openai.com/v1/chat/completions');
});

test('provider base URL allows local targets while the app listens on loopback', async () => {
  delete process.env.APP_HOST;
  const parsed = await assertSafeProviderBaseUrl('http://127.0.0.1:3000/v1');
  assert.equal(parsed.hostname, '127.0.0.1');
});

test('provider base URL rejects local targets when the app is exposed', async () => {
  process.env.APP_HOST = '0.0.0.0';
  await assert.rejects(() => assertSafeProviderBaseUrl('https://127.0.0.1:3000/v1'), {
    code: 'REMOTE_HOST_FORBIDDEN',
  });
  delete process.env.APP_HOST;
});

test('provider base URL rejects non-https public targets', async () => {
  await assert.rejects(() => assertSafeProviderBaseUrl('http://93.184.216.34/v1'), {
    code: 'INVALID_REMOTE_URL',
  });
});

test('remote download URL allows public targets and blocks localhost when private download is disabled', async () => {
  const parsed = await assertSafeRemoteDownloadUrl('https://93.184.216.34/video.mp4');
  assert.equal(parsed.hostname, '93.184.216.34');

  process.env.APP_HOST = '0.0.0.0';
  delete process.env.APP_ALLOW_PRIVATE_DOWNLOAD_URLS;
  await assert.rejects(() => assertSafeRemoteDownloadUrl('http://localhost:8080/video.mp4'), {
    code: 'REMOTE_HOST_FORBIDDEN',
  });
  delete process.env.APP_HOST;
});

test('remote download URL allows local targets while the app listens on loopback', async () => {
  delete process.env.APP_HOST;
  delete process.env.APP_ALLOW_PRIVATE_DOWNLOAD_URLS;

  const parsed = await assertSafeRemoteDownloadUrl('http://127.0.0.1:8080/image.png');
  assert.equal(parsed.hostname, '127.0.0.1');
});

test('remote download URL allows private targets when explicitly enabled', async () => {
  process.env.APP_HOST = '0.0.0.0';
  process.env.APP_ALLOW_PRIVATE_DOWNLOAD_URLS = 'true';

  const parsed = await assertSafeRemoteDownloadUrl('http://192.168.1.10:8080/image.png');
  assert.equal(parsed.hostname, '192.168.1.10');

  delete process.env.APP_HOST;
  delete process.env.APP_ALLOW_PRIVATE_DOWNLOAD_URLS;
});
