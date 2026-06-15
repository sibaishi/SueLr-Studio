/** Raw file data store (outside React state — for performance). */

interface FileRecord {
  blob: Blob;
  objectUrl: string;
  base64: string;
  name: string;
}

const store = new Map<number, FileRecord>();
let nextId = Date.now();

export const fileRawStore = {
  add(blob: Blob, name: string, base64: string): number {
    const id = nextId++;
    const objectUrl = URL.createObjectURL(blob);
    store.set(id, { blob, objectUrl, base64, name });
    return id;
  },
  get(id: number): FileRecord | undefined {
    return store.get(id);
  },
  getObjectUrl(id: number): string | undefined {
    return store.get(id)?.objectUrl;
  },
  getBase64(id: number): string | undefined {
    return store.get(id)?.base64;
  },
  remove(id: number) {
    const rec = store.get(id);
    if (rec) {
      URL.revokeObjectURL(rec.objectUrl);
      store.delete(id);
    }
  },
  has(id: number): boolean {
    return store.has(id);
  },
};
