import test from 'node:test';
import assert from 'node:assert/strict';

import {
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
  const strategy = resolveProxyStrategy(
    'https://api.example.com/v1/models',
    { HTTPS_PROXY: 'http://127.0.0.1:8888' },
    'win32',
  );
  assert.equal(strategy.mode, 'env');
  assert.equal(strategy.proxyUrl, 'http://127.0.0.1:8888');
});
