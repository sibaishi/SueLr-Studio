import { getRequestContext } from './request-context.ts';

export type LogLevel = 'info' | 'warn' | 'error';
export type LogFields = Record<string, unknown>;

export interface Logger {
  child(childBindings?: LogFields): Logger;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
}

function write(level: LogLevel, entry: LogFields): void {
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

function buildEntry(bindings: LogFields, message: string, fields?: LogFields): LogFields {
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

export function createLogger(bindings: LogFields = {}): Logger {
  return {
    child(childBindings: LogFields = {}) {
      return createLogger({ ...bindings, ...childBindings });
    },
    info(message: string, fields: LogFields | undefined = undefined) {
      write('info', buildEntry(bindings, message, fields));
    },
    warn(message: string, fields: LogFields | undefined = undefined) {
      write('warn', buildEntry(bindings, message, fields));
    },
    error(message: string, fields: LogFields | undefined = undefined) {
      write('error', buildEntry(bindings, message, fields));
    },
  };
}

export const logger = createLogger({ module: 'app' });
