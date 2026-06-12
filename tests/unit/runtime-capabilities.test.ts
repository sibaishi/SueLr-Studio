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

function createSnapshot(overrides = {}) {
  return {
    mode: 'local-web' as const,
    canSelectDirectory: true,
    canRestartBackend: true,
    hasEmbeddedShell: false,
    search: {
      enabled: false,
      provider: 'tavily',
      disabledReason: 'search disabled',
    },
    ...overrides,
  };
}

describe('runtime capability cache', () => {
  it('stores and clears capability snapshots for capability-aware UI code', () => {
    const snapshot = createSnapshot();

    setCachedRuntimeCapabilities(snapshot);
    expect(getCachedRuntimeCapabilities()).toEqual(snapshot);

    setCachedRuntimeCapabilities(null);
    expect(getCachedRuntimeCapabilities()).toBeNull();
  });

  it('formats runtime labels and disabled action hints for settings UI', () => {
    const snapshot = createSnapshot({
      canSelectDirectory: false,
      canRestartBackend: false,
    });

    expect(formatRuntimeModeLabel(snapshot.mode)).toBe('本地 Web');
    expect(getRuntimeActionHint(snapshot, 'canSelectDirectory')).toBeTruthy();
    expect(getRuntimeActionHint(snapshot, 'canRestartBackend')).toBeTruthy();
  });

  it('defaults to local-web runtime capabilities', async () => {
    await withEnv(
      {
        APP_RUNTIME_MODE: undefined,
        APP_EMBEDDED_BACKEND: undefined,
      },
      async () => {
        const { getRuntimeCapabilities } = await import('../../backend/src/platform/runtime/capabilities.ts');
        const capabilities = getRuntimeCapabilities();

        expect(capabilities.mode).toBe('local-web');
        expect(capabilities.canSelectDirectory).toBe(true);
        expect(capabilities.canRestartBackend).toBe(true);
      },
    );
  });
});
