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
      mode: 'local-web',
      canSelectDirectory: true,
      canRestartBackend: true,
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
        requiresAccessKey: false,
        configured: true,
      },
    } as const;

    setCachedRuntimeCapabilities(snapshot);
    expect(getCachedRuntimeCapabilities()).toEqual(snapshot);

    setCachedRuntimeCapabilities(null);
    expect(getCachedRuntimeCapabilities()).toBeNull();
  });

  it('formats runtime labels and disabled action hints for settings UI', () => {
    const snapshot = {
      mode: 'local-web',
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
        requiresAccessKey: false,
        configured: true,
      },
    } as const;

    expect(formatRuntimeModeLabel(snapshot.mode)).toBeTruthy();
    expect(getRuntimeActionHint(snapshot, 'canSelectDirectory')).toBeTruthy();
    expect(getRuntimeActionHint(snapshot, 'canRestartBackend')).toBeTruthy();
  });

  it('defaults to local-web runtime capabilities', async () => {
    await withEnv(
      {
        APP_RUNTIME_MODE: undefined,
        APP_ADMIN_ACCESS_KEY: undefined,
        APP_EMBEDDED_BACKEND: undefined,
      },
      async () => {
        const { getRuntimeCapabilities } = await import('../../backend/src/platform/runtime/capabilities.ts');
        const capabilities = getRuntimeCapabilities();

        expect(capabilities.mode).toBe('local-web');
        expect(capabilities.auth.required).toBe(false);
        expect(capabilities.auth.mode).toBe('none');
        expect(capabilities.canSelectDirectory).toBe(true);
        expect(capabilities.canRestartBackend).toBe(true);
        expect(capabilities.adminConsole.requiresAccessKey).toBe(false);
        expect(capabilities.adminConsole.configured).toBe(true);
      },
    );
  });
});
