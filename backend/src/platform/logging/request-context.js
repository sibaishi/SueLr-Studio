import { AsyncLocalStorage } from 'async_hooks';

const storage = new AsyncLocalStorage();

export function runWithRequestContext(context, callback) {
  return storage.run({ ...(storage.getStore() || {}), ...(context || {}) }, callback);
}

export function getRequestContext() {
  return storage.getStore() || null;
}
