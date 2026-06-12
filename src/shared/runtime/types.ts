export type RuntimeMode = 'desktop' | 'local-web';

export type RuntimeCapabilities = {
  mode: RuntimeMode;
  canSelectDirectory: boolean;
  canRestartBackend: boolean;
  hasEmbeddedShell: boolean;
  search: {
    enabled: boolean;
    provider: string;
    disabledReason: string;
  };
};
