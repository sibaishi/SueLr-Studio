// ============================================================
// Flow Studio - Express 服务器入口
// ============================================================

import { pathToFileURL } from 'url';
import { createLogger } from './src/platform/logging/logger.js';
import { createApp } from './src/app/create-app.js';
import './src/platform/system/restart-trigger.js';
import {
  getProcessInstanceId,
  installRuntimeObservability,
} from './src/platform/logging/runtime-observability.js';

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
    logger.error('server start failed', { error: error?.message, stack: error?.stack });
    process.exit(1);
  }
}
