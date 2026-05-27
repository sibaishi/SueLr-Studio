// ============================================================
// Flow Studio - Express server entry
// ============================================================

import { pathToFileURL } from 'url';
import { createLogger } from './src/platform/logging/logger.ts';
import { createApp } from './src/app/create-app.ts';
import './src/platform/system/restart-trigger.ts';
import {
  getProcessInstanceId,
  installRuntimeObservability,
} from './src/platform/logging/runtime-observability.ts';

const PORT = process.env.APP_PORT || process.env.PORT || 3001;
const HOST = process.env.APP_HOST || '127.0.0.1';
const logger = createLogger({ module: 'server' });

installRuntimeObservability();

export function startServer(port = PORT, host = HOST) {
  const app = createApp();
  return app.listen(port, host, () => {
    logger.info('server started', {
      processInstanceId: getProcessInstanceId(),
      host,
      port,
      url: `http://${host}:${port}`,
      apiUrl: `http://${host}:${port}/api`,
      healthUrl: `http://${host}:${port}/api/health`,
    });
  });
}

const entryHref = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === entryHref) {
  try {
    startServer();
  } catch (error) {
    const details = error instanceof Error ? { error: error.message, stack: error.stack } : { error: String(error) };
    logger.error('server start failed', details);
    process.exit(1);
  }
}
