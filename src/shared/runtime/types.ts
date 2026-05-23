export type RuntimeMode = 'desktop' | 'local-web' | 'server-single-user' | 'server-multi-user';

export type RuntimeCapabilities = {
  mode: RuntimeMode;
  canSelectDirectory: boolean;
  canRestartBackend: boolean;
  hasEmbeddedShell: boolean;
};
