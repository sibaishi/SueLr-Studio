export type RuntimeMode = 'desktop' | 'local-web';

export function getRuntimeMode(): RuntimeMode {
  const configuredMode = String(process.env.APP_RUNTIME_MODE || '').trim();
  if (configuredMode === 'desktop' || configuredMode === 'local-web') {
    return configuredMode;
  }

  if (process.env.APP_EMBEDDED_BACKEND === '1') {
    return 'desktop';
  }

  return 'local-web';
}
