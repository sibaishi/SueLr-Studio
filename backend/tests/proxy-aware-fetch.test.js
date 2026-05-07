import test from 'node:test';
import assert from 'node:assert/strict';

import {
  configureOutboundProxy,
  readWindowsInternetSettings,
  resolveProxyStrategy,
  selectWindowsProxyServer,
} from '../src/platform/http/proxy-aware-fetch.js';

test('selectWindowsProxyServer picks https entry from registry proxy list', () => {
  const proxyUrl = selectWindowsProxyServer('http=127.0.0.1:7890;https=127.0.0.1:7897', 'https:');
  assert.equal(proxyUrl, 'http://127.0.0.1:7897');
});

test('readWindowsInternetSettings parses registry output', () => {
  const sample = `
HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings
    ProxyEnable    REG_DWORD    0x1
    ProxyServer    REG_SZ       127.0.0.1:7897
    ProxyOverride  REG_SZ       *.local;<local>
`;
  const settings = readWindowsInternetSettings(() => sample);
  assert.deepEqual(settings, {
    enabled: true,
    proxyServer: '127.0.0.1:7897',
    proxyOverride: '*.local;<local>',
    autoConfigUrl: '',
  });
});

test('resolveProxyStrategy prefers explicit environment proxy', () => {
  configureOutboundProxy({ mode: 'system' });
  const strategy = resolveProxyStrategy(
    'https://api.example.com/v1/models',
    { HTTPS_PROXY: 'http://127.0.0.1:8888' },
    'win32',
  );
  assert.equal(strategy.mode, 'env');
  assert.equal(strategy.proxyUrl, 'http://127.0.0.1:8888');
});

test('resolveProxyStrategy uses app custom proxy before environment proxy', () => {
  configureOutboundProxy({
    mode: 'custom',
    httpProxy: '127.0.0.1:7890',
    httpsProxy: 'http://127.0.0.1:7897',
  });

  const strategy = resolveProxyStrategy(
    'https://api.example.com/v1/models',
    { HTTPS_PROXY: 'http://127.0.0.1:8888' },
    'win32',
  );

  assert.equal(strategy.mode, 'app-custom');
  assert.equal(strategy.proxySource, 'app-settings');
  assert.equal(strategy.proxyUrl, 'http://127.0.0.1:7897');
  configureOutboundProxy({ mode: 'system' });
});

test('resolveProxyStrategy bypasses custom proxy for noProxy matches', () => {
  configureOutboundProxy({
    mode: 'custom',
    httpsProxy: 'http://127.0.0.1:7897',
    noProxy: 'api.internal,*.local;<local>',
  });

  const exact = resolveProxyStrategy('https://api.internal/v1/models');
  const wildcard = resolveProxyStrategy('https://service.local/v1/models');
  const local = resolveProxyStrategy('https://intranet/v1/models');

  assert.equal(exact.proxySource, 'app-no-proxy');
  assert.equal(wildcard.proxySource, 'app-no-proxy');
  assert.equal(local.proxySource, 'app-no-proxy');
  configureOutboundProxy({ mode: 'system' });
});

test('resolveProxyStrategy direct mode disables environment and system proxy', () => {
  configureOutboundProxy({ mode: 'direct' });
  const strategy = resolveProxyStrategy(
    'https://api.example.com/v1/models',
    { HTTPS_PROXY: 'http://127.0.0.1:8888' },
    'win32',
  );

  assert.equal(strategy.mode, 'direct');
  assert.equal(strategy.proxySource, 'app-direct');
  assert.equal(strategy.proxyUrl, '');
  configureOutboundProxy({ mode: 'system' });
});
