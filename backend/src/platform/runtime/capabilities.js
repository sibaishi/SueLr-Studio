import { getRuntimeMode, isServerRuntimeMode } from './mode.js';

export function getRuntimeCapabilities(mode = getRuntimeMode()) {
  const serverMode = isServerRuntimeMode(mode);

  return {
    mode,
    canSelectDirectory: !serverMode,
    canRestartBackend: !serverMode,
    hasEmbeddedShell: mode === 'desktop',
  };
}
