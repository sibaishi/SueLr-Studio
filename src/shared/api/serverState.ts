import type { RuntimeCapabilities } from '@/shared/runtime';

let backendAvailable = false;
let runtimeCapabilities: RuntimeCapabilities | null = null;

export function isBackendAvailable() {
  return backendAvailable;
}

export function setBackendAvailable(value: boolean) {
  backendAvailable = value;
}

export function getCachedRuntimeCapabilities() {
  return runtimeCapabilities;
}

export function setCachedRuntimeCapabilities(value: RuntimeCapabilities | null) {
  runtimeCapabilities = value;
}
