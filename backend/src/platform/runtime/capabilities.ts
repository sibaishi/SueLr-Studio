import { type RuntimeMode, getRuntimeMode } from './mode.ts';

interface RuntimeCapabilities {
  mode: RuntimeMode;
  canSelectDirectory: boolean;
  canRestartBackend: boolean;
  hasEmbeddedShell: boolean;
}

export function getRuntimeCapabilities(mode: RuntimeMode = getRuntimeMode()): RuntimeCapabilities {
  return {
    mode,
    canSelectDirectory: true,
    canRestartBackend: true,
    hasEmbeddedShell: mode === 'desktop',
  };
}
