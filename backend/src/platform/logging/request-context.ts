import { AsyncLocalStorage } from 'node:async_hooks';
import type { RequestScope } from '../runtime/request-scope.js';

export interface RequestContext {
  requestId?: string;
  runId?: string;
  scope?: RequestScope;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext<T>(context: RequestContext = {}, callback: () => T): T {
  return storage.run({ ...(storage.getStore() || {}), ...context }, callback);
}

export function getRequestContext(): RequestContext | null {
  return storage.getStore() || null;
}
