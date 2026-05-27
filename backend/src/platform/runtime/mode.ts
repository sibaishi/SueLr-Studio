const SERVER_MODES = new Set(['server-single-user', 'server-multi-user']);

export type RuntimeMode = 'desktop' | 'local-web' | 'server-single-user' | 'server-multi-user' | (string & {});

export function getRuntimeMode(): RuntimeMode {
  const configuredMode = String(process.env.APP_RUNTIME_MODE || '').trim();
  if (configuredMode) {
    return configuredMode;
  }

  if (process.env.APP_EMBEDDED_BACKEND === '1') {
    return 'desktop';
  }

  if (process.env.APP_SERVER_MODE === 'multi-user') {
    return 'server-multi-user';
  }

  return 'local-web';
}

export function isServerRuntimeMode(mode: RuntimeMode = getRuntimeMode()): boolean {
  return SERVER_MODES.has(mode);
}
