import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { createLogger } from './logger.js';
import { ensureLogDirectories } from './workflow-run-logger.js';
import { createDefaultRequestScope } from '../runtime/index.js';

const logger = createLogger({ module: 'runtime-observability' });
const processInstanceId = randomUUID();
let installed = false;

function getStartupLogPath() {
  const dirs = ensureLogDirectories();
  const day = new Date().toISOString().slice(0, 10);
  return path.join(dirs.startup, `${day}.jsonl`);
}

function appendStartupEvent(event, fields = {}) {
  const filePath = getStartupLogPath();
  const scope = createDefaultRequestScope();
  const payload = {
    timestamp: new Date().toISOString(),
    event,
    processInstanceId,
    ownerUserId: scope.userId,
    workspaceId: scope.workspaceId,
    ownershipScope: scope,
    pid: process.pid,
    ppid: process.ppid,
    ...fields,
  };
  fs.appendFileSync(filePath, `${JSON.stringify(payload)}\n`, 'utf8');
}

function logProcessLifecycle(event, fields = {}) {
  logger.info(event, {
    processInstanceId,
    pid: process.pid,
    ppid: process.ppid,
    ...fields,
  });
  appendStartupEvent(event, fields);
}

export function getProcessInstanceId() {
  return processInstanceId;
}

export function recordRuntimeEvent(event, fields = {}) {
  logProcessLifecycle(event, fields);
}

export function installRuntimeObservability() {
  if (installed) return processInstanceId;
  installed = true;

  logProcessLifecycle('process_boot', {
    argv: process.argv.slice(1),
    nodeVersion: process.version,
  });

  process.on('SIGINT', () => {
    logProcessLifecycle('process_signal', { signal: 'SIGINT' });
  });

  process.on('SIGTERM', () => {
    logProcessLifecycle('process_signal', { signal: 'SIGTERM' });
  });

  process.on('beforeExit', (code) => {
    logProcessLifecycle('process_before_exit', { code });
  });

  process.on('exit', (code) => {
    appendStartupEvent('process_exit', { code });
  });

  process.on('uncaughtException', (error) => {
    logger.error('process_uncaught_exception', {
      processInstanceId,
      pid: process.pid,
      error: error?.message,
      stack: error?.stack,
    });
    appendStartupEvent('process_uncaught_exception', {
      error: error?.message,
      stack: error?.stack,
    });
  });

  process.on('unhandledRejection', (reason) => {
    const errorMessage = reason instanceof Error ? reason.message : String(reason);
    const errorStack = reason instanceof Error ? reason.stack : undefined;
    logger.error('process_unhandled_rejection', {
      processInstanceId,
      pid: process.pid,
      error: errorMessage,
      stack: errorStack,
    });
    appendStartupEvent('process_unhandled_rejection', {
      error: errorMessage,
      stack: errorStack,
    });
  });

  return processInstanceId;
}
