export type RuntimeMode = 'desktop' | 'local-web' | 'server-single-user' | 'server-multi-user';

export type RuntimeCapabilities = {
  mode: RuntimeMode;
  canSelectDirectory: boolean;
  canRestartBackend: boolean;
  hasEmbeddedShell: boolean;
  auth: {
    required: boolean;
    mode: 'none' | 'session';
    user: {
      id: string;
      username: string;
      email?: string;
      status?: 'pending' | 'active' | 'rejected' | 'disabled';
      workspaceId?: 'default';
    } | null;
  };
  search: {
    enabled: boolean;
    provider: string;
    disabledReason: string;
  };
  adminConsole: {
    enabled: boolean;
    requiresAccessKey: boolean;
    configured: boolean;
  };
};
