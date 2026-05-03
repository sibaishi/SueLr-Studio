let backendAvailable = false;

export function isBackendAvailable() {
  return backendAvailable;
}

export function setBackendAvailable(value: boolean) {
  backendAvailable = value;
}
