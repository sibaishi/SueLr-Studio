function openSessions() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('suelr-agent', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('sessions');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function readAgentSessions<T>(): Promise<T | undefined> {
  const database = await openSessions();
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const request = database.transaction('sessions').objectStore('sessions').get('workspace');
      request.onsuccess = () => resolve(request.result as T | undefined);
      request.onerror = () => reject(request.error);
    });
  } finally {
    database.close();
  }
}

export async function writeAgentSessions<T>(workspace: T) {
  const database = await openSessions();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction('sessions', 'readwrite');
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error);
      transaction.objectStore('sessions').put(workspace, 'workspace');
    });
  } finally {
    database.close();
  }
}
