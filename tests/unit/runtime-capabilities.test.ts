import { formatRuntimeModeLabel, getRuntimeActionHint } from '@/features/settings/runtimePresentation';
import { getCachedRuntimeCapabilities, setCachedRuntimeCapabilities } from '@/shared/api/serverState';
import { describe, expect, it } from 'vitest';

async function withEnv<T>(env: Record<string, string | undefined>, callback: () => Promise<T> | T): Promise<T> {
  const previous = new Map<string, string | undefined>();
  for (const key of Object.keys(env)) {
    previous.set(key, process.env[key]);
    if (env[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = env[key];
    }
  }

  try {
    return await callback();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

describe('runtime capability cache', () => {
  it('stores and clears capability snapshots for capability-aware UI code', () => {
    const snapshot = {
      mode: 'server-single-user',
      canSelectDirectory: false,
      canRestartBackend: false,
      hasEmbeddedShell: false,
      auth: {
        required: false,
        mode: 'none',
        user: null,
      },
      search: {
        enabled: false,
        provider: 'tavily',
        disabledReason: 'search disabled',
      },
      adminConsole: {
        enabled: true,
        requiresAccessKey: true,
        configured: false,
      },
    } as const;

    setCachedRuntimeCapabilities(snapshot);
    expect(getCachedRuntimeCapabilities()).toEqual(snapshot);

    setCachedRuntimeCapabilities(null);
    expect(getCachedRuntimeCapabilities()).toBeNull();
  });

  it('formats runtime labels and server-only action hints for settings UI', () => {
    const snapshot = {
      mode: 'server-single-user',
      canSelectDirectory: false,
      canRestartBackend: false,
      hasEmbeddedShell: false,
      auth: {
        required: false,
        mode: 'none',
        user: null,
      },
      search: {
        enabled: false,
        provider: 'tavily',
        disabledReason: 'search disabled',
      },
      adminConsole: {
        enabled: true,
        requiresAccessKey: true,
        configured: false,
      },
    } as const;

    expect(formatRuntimeModeLabel(snapshot.mode)).toBeTruthy();
    expect(getRuntimeActionHint(snapshot, 'canSelectDirectory')).toBeTruthy();
    expect(getRuntimeActionHint(snapshot, 'canRestartBackend')).toBeTruthy();
  });

  it('defaults server-web runtime context to authenticated multi-user capabilities', async () => {
    await withEnv(
      {
        APP_RUNTIME_MODE: undefined,
        APP_SERVER_WEB: '1',
        APP_ADMIN_ACCESS_KEY: 'test-admin-key',
      },
      async () => {
        const { getRuntimeCapabilities } = await import('../../backend/src/platform/runtime/capabilities.ts');
        const capabilities = getRuntimeCapabilities();

        expect(capabilities.mode).toBe('server-multi-user');
        expect(capabilities.auth.required).toBe(true);
        expect(capabilities.auth.mode).toBe('session');
        expect(capabilities.adminConsole.requiresAccessKey).toBe(true);
        expect(capabilities.adminConsole.configured).toBe(true);
      },
    );
  });
});
