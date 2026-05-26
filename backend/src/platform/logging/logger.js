import { getRequestContext } from './request-context.js';

function write(level, entry) {
  const payload = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    ...entry,
  });

  if (level === 'error' || level === 'warn') {
    console.error(payload);
    return;
  }

  console.log(payload);
}

function buildEntry(bindings, message, fields) {
  const context = getRequestContext();
  const scope = context?.scope;
  return {
    ...bindings,
    ...(context?.requestId ? { requestId: context.requestId } : {}),
    ...(context?.runId ? { runId: context.runId } : {}),
    ...(scope ? { scope } : {}),
    message,
    ...(fields || {}),
  };
}

export function createLogger(bindings = {}) {
  return {
    child(childBindings = {}) {
      return createLogger({ ...bindings, ...childBindings });
    },
    info(message, fields = undefined) {
      write('info', buildEntry(bindings, message, fields));
    },
    warn(message, fields = undefined) {
      write('warn', buildEntry(bindings, message, fields));
    },
    error(message, fields = undefined) {
      write('error', buildEntry(bindings, message, fields));
    },
  };
}

export const logger = createLogger({ module: 'app' });
