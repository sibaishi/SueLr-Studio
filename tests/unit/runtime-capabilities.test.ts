import { describe, expect, it } from 'vitest';
import { getCachedRuntimeCapabilities, setCachedRuntimeCapabilities } from '@/shared/api/serverState';
import { formatRuntimeModeLabel, getRuntimeActionHint } from '@/features/settings/runtimePresentation';

describe('runtime capability cache', () => {
  it('stores and clears capability snapshots for capability-aware UI code', () => {
    const snapshot = {
      mode: 'server-single-user',
      canSelectDirectory: false,
      canRestartBackend: false,
      hasEmbeddedShell: false,
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
    } as const;

    expect(formatRuntimeModeLabel(snapshot.mode)).toBe('服务器单用户');
    expect(getRuntimeActionHint(snapshot, 'canSelectDirectory')).toContain('浏览器侧如需自动下载');
    expect(getRuntimeActionHint(snapshot, 'canRestartBackend')).toContain('部署端');
  });
});
