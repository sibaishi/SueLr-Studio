import { formatRuntimeModeLabel, getRuntimeActionHint } from '@/features/settings/runtimePresentation';
import { getCachedRuntimeCapabilities, setCachedRuntimeCapabilities } from '@/shared/api/serverState';
import { describe, expect, it } from 'vitest';

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
});
