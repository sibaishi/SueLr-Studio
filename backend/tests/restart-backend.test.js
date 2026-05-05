import test from 'node:test';
import assert from 'node:assert/strict';

test('backend restart is non-destructive when running inside the Electron shell', async () => {
  const previous = process.env.APP_EMBEDDED_BACKEND;
  process.env.APP_EMBEDDED_BACKEND = '1';

  try {
    const { scheduleBackendRestart } = await import(`../src/platform/system/restart-backend.js?test=${Date.now()}`);
    const result = await scheduleBackendRestart();

    assert.deepEqual(result, { mode: 'desktop', restartRequired: true });
  } finally {
    if (previous === undefined) {
      delete process.env.APP_EMBEDDED_BACKEND;
    } else {
      process.env.APP_EMBEDDED_BACKEND = previous;
    }
  }
});

test('backend restart reports desktop relaunch when Electron runtime is available', async () => {
  const previous = process.env.APP_EMBEDDED_BACKEND;
  const previousRelaunch = process.env.APP_DESKTOP_RELAUNCH;
  const previousRelaunchHook = process.env.APP_DESKTOP_RELAUNCH_HOOK;
  const previousDisableRelaunch = process.env.APP_DISABLE_DESKTOP_RELAUNCH;
  process.env.APP_EMBEDDED_BACKEND = '1';
  process.env.APP_DESKTOP_RELAUNCH = '1';
  process.env.APP_DESKTOP_RELAUNCH_HOOK = '1';
  process.env.APP_DISABLE_DESKTOP_RELAUNCH = '1';

  try {
    const { scheduleBackendRestart } = await import(`../src/platform/system/restart-backend.js?test=${Date.now()}`);
    const result = await scheduleBackendRestart();

    assert.deepEqual(result, { mode: 'desktop-relaunch', restartRequired: true });
  } finally {
    if (previous === undefined) {
      delete process.env.APP_EMBEDDED_BACKEND;
    } else {
      process.env.APP_EMBEDDED_BACKEND = previous;
    }
    if (previousRelaunch === undefined) {
      delete process.env.APP_DESKTOP_RELAUNCH;
    } else {
      process.env.APP_DESKTOP_RELAUNCH = previousRelaunch;
    }
    if (previousRelaunchHook === undefined) {
      delete process.env.APP_DESKTOP_RELAUNCH_HOOK;
    } else {
      process.env.APP_DESKTOP_RELAUNCH_HOOK = previousRelaunchHook;
    }
    if (previousDisableRelaunch === undefined) {
      delete process.env.APP_DISABLE_DESKTOP_RELAUNCH;
    } else {
      process.env.APP_DISABLE_DESKTOP_RELAUNCH = previousDisableRelaunch;
    }
  }
});
