// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';

function createStorageDir(name) {
  const root = path.resolve('C:/Users/ADMINI~1.WIN/AppData/Local/Temp/opencode', `account-details-${name}-${Date.now()}`);
  fs.mkdirSync(root, { recursive: true });
  return root;
}

function jsonResponse(body, options = {}) {
  return new Response(JSON.stringify(body), {
    status: options.status || 200,
    headers: options.headers || {},
  });
}

test('account details service stores credentials but only returns public state', async () => {
  const root = createStorageDir('login');
  process.env.APP_CONFIG_DIR = root;
  process.env.APP_STORAGE_BOOTSTRAP_FILE = path.join(root, 'config', 'bootstrap.json');
  process.env.APP_DISABLE_LEGACY_STORAGE_MIGRATION = '1';

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).includes('/login')) {
      return jsonResponse({
        success: true,
        message: '',
        data: {
          id: 129,
          username: 'demo-user',
          display_name: 'Demo User',
          role: 1,
          status: 1,
        },
      }, {
        headers: {
          'set-cookie': 'session=session-token; Path=/; Expires=Thu, 18 Jun 2026 07:28:26 GMT; HttpOnly; SameSite=Strict',
        },
      });
    }
    return jsonResponse({
      success: true,
      data: {
        id: 129,
        username: 'demo-user',
        display_name: 'Demo User',
        role: 1,
        status: 1,
        quota: 25000000,
        used_quota: 22627709,
        request_count: 486,
      },
    });
  };

  try {
    const { accountDetailsService } = await import(`../src/modules/settings/account-details.service.ts?test=${Date.now()}`);
    const publicState = await accountDetailsService.saveCredentials({ username: ' demo-user ', password: 'secret' });

    assert.equal(publicState.configured, true);
    assert.equal(publicState.username, 'demo-user');
    assert.equal(publicState.loggedIn, true);
    assert.equal(publicState.user.displayName, 'Demo User');
    assert.equal(publicState.balance.balance, 50);
    assert.equal(publicState.password, undefined);
    assert.equal(publicState.session, undefined);

    const stored = JSON.parse(fs.readFileSync(path.join(root, 'config', 'account-details.json'), 'utf8'));
    assert.equal(stored.password, 'secret');
    assert.equal(stored.session, 'session-token');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('account details service refreshes balance and converts quota to balance', async () => {
  const root = createStorageDir('balance');
  process.env.APP_CONFIG_DIR = root;
  process.env.APP_STORAGE_BOOTSTRAP_FILE = path.join(root, 'config', 'bootstrap.json');
  process.env.APP_DISABLE_LEGACY_STORAGE_MIGRATION = '1';

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).includes('/login')) {
      return jsonResponse({
        success: true,
        data: { id: 129, username: 'demo-user', display_name: 'Demo User', role: 1, status: 1 },
      }, {
        headers: { 'set-cookie': 'session=session-token; Path=/; Expires=Thu, 18 Jun 2026 07:28:26 GMT; HttpOnly' },
      });
    }
    return jsonResponse({
      success: true,
      data: {
        id: 129,
        username: 'demo-user',
        display_name: 'Demo User',
        role: 1,
        status: 1,
        quota: 25000000,
        used_quota: 22627709,
        request_count: 486,
      },
    });
  };

  try {
    const { accountDetailsService } = await import(`../src/modules/settings/account-details.service.ts?test=${Date.now()}`);
    await accountDetailsService.saveCredentials({ username: 'demo-user', password: 'secret' });
    const refreshed = await accountDetailsService.refreshBalance();

    assert.equal(refreshed.balance.quota, 25000000);
    assert.equal(refreshed.balance.usedQuota, 22627709);
    assert.equal(refreshed.balance.requestCount, 486);
    assert.equal(refreshed.balance.balance, 50);
    assert.equal(refreshed.balance.usedBalance, 45.26);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('account details service relogs once when balance query fails', async () => {
  const root = createStorageDir('relogin');
  process.env.APP_CONFIG_DIR = root;
  process.env.APP_STORAGE_BOOTSTRAP_FILE = path.join(root, 'config', 'bootstrap.json');
  process.env.APP_DISABLE_LEGACY_STORAGE_MIGRATION = '1';

  const originalFetch = globalThis.fetch;
  let loginCount = 0;
  let selfCount = 0;
  globalThis.fetch = async (url) => {
    if (String(url).includes('/login')) {
      loginCount += 1;
      return jsonResponse({
        success: true,
        data: { id: 129, username: 'demo-user', display_name: 'Demo User', role: 1, status: 1 },
      }, {
        headers: { 'set-cookie': `session=session-token-${loginCount}; Path=/; Expires=Thu, 18 Jun 2026 07:28:26 GMT; HttpOnly` },
      });
    }
    selfCount += 1;
    if (selfCount === 2) {
      return jsonResponse({ success: false, message: 'unauthorized' }, { status: 401 });
    }
    return jsonResponse({
      success: true,
      data: {
        id: 129,
        username: 'demo-user',
        display_name: 'Demo User',
        role: 1,
        status: 1,
        quota: 50000,
        used_quota: 0,
        request_count: 1,
      },
    });
  };

  try {
    const { accountDetailsService } = await import(`../src/modules/settings/account-details.service.ts?test=${Date.now()}`);
    await accountDetailsService.saveCredentials({ username: 'demo-user', password: 'secret' });
    const refreshed = await accountDetailsService.refreshBalance();

    assert.equal(loginCount, 2);
    assert.equal(selfCount, 3);
    assert.equal(refreshed.balance.balance, 0.1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('account details service proxies personal logs and normalizes costs', async () => {
  const root = createStorageDir('logs');
  process.env.APP_CONFIG_DIR = root;
  process.env.APP_STORAGE_BOOTSTRAP_FILE = path.join(root, 'config', 'bootstrap.json');
  process.env.APP_DISABLE_LEGACY_STORAGE_MIGRATION = '1';

  const originalFetch = globalThis.fetch;
  let logUrl = '';
  globalThis.fetch = async (url) => {
    const urlText = String(url);
    if (urlText.includes('/login')) {
      return jsonResponse({
        success: true,
        data: { id: 129, username: 'demo-user', display_name: 'Demo User', role: 1, status: 1 },
      }, {
        headers: { 'set-cookie': 'session=session-token; Path=/; Expires=Thu, 18 Jun 2026 07:28:26 GMT; HttpOnly' },
      });
    }
    if (urlText.includes('/api/log/self')) {
      logUrl = urlText;
      return jsonResponse({
        success: true,
        data: {
          total: 1,
          page: 2,
          page_size: 20,
          items: [{
            id: 7,
            user_id: 129,
            created_at: 1779177600,
            type: 2,
            content: 'chat completion',
            token_name: 'main-key',
            model_name: 'gpt-demo',
            quota: 1234567,
            prompt_tokens: 100,
            completion_tokens: 50,
          }],
        },
      });
    }
    return jsonResponse({
      success: true,
      data: {
        id: 129,
        username: 'demo-user',
        display_name: 'Demo User',
        role: 1,
        status: 1,
        quota: 25000000,
        used_quota: 22627709,
        request_count: 486,
      },
    });
  };

  try {
    const { accountDetailsService } = await import(`../src/modules/settings/account-details.service.ts?test=${Date.now()}`);
    await accountDetailsService.saveCredentials({ username: 'demo-user', password: 'secret' });
    const logs = await accountDetailsService.getLogs({ page: 2, pageSize: 250 });

    assert.equal(logUrl.includes('/api/log/self?'), true);
    assert.equal(logUrl.includes('p=2'), true);
    assert.equal(logUrl.includes('page_size=100'), true);
    assert.equal(logs.total, 1);
    assert.equal(logs.pageSize, 20);
    assert.equal(logs.items[0].modelName, 'gpt-demo');
    assert.equal(logs.items[0].cost, 2.47);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('account details service relogs once when personal logs query fails', async () => {
  const root = createStorageDir('logs-relogin');
  process.env.APP_CONFIG_DIR = root;
  process.env.APP_STORAGE_BOOTSTRAP_FILE = path.join(root, 'config', 'bootstrap.json');
  process.env.APP_DISABLE_LEGACY_STORAGE_MIGRATION = '1';

  const originalFetch = globalThis.fetch;
  let loginCount = 0;
  let logCount = 0;
  globalThis.fetch = async (url) => {
    const urlText = String(url);
    if (urlText.includes('/login')) {
      loginCount += 1;
      return jsonResponse({
        success: true,
        data: { id: 129, username: 'demo-user', display_name: 'Demo User', role: 1, status: 1 },
      }, {
        headers: { 'set-cookie': `session=session-token-${loginCount}; Path=/; Expires=Thu, 18 Jun 2026 07:28:26 GMT; HttpOnly` },
      });
    }
    if (urlText.includes('/api/log/self')) {
      logCount += 1;
      if (logCount === 1) return jsonResponse({ success: false, message: 'unauthorized' }, { status: 401 });
      return jsonResponse({ success: true, data: { total: 0, page: 1, page_size: 20, items: [] } });
    }
    return jsonResponse({
      success: true,
      data: {
        id: 129,
        username: 'demo-user',
        display_name: 'Demo User',
        role: 1,
        status: 1,
        quota: 25000000,
        used_quota: 22627709,
        request_count: 486,
      },
    });
  };

  try {
    const { accountDetailsService } = await import(`../src/modules/settings/account-details.service.ts?test=${Date.now()}`);
    await accountDetailsService.saveCredentials({ username: 'demo-user', password: 'secret' });
    const logs = await accountDetailsService.getLogs();

    assert.equal(loginCount, 2);
    assert.equal(logCount, 2);
    assert.equal(logs.items.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
