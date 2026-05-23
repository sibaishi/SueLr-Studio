const SERVER_MODES = new Set(['server-single-user', 'server-multi-user']);

export function getRuntimeMode() {
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

export function isServerRuntimeMode(mode = getRuntimeMode()) {
  return SERVER_MODES.has(mode);
}
