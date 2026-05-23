export const gid = () => Date.now().toString(36) + Math.random().toString(36).slice(2);
export const ftime = (timestamp: number) => new Date(timestamp).toLocaleTimeString('zh-CN');
export const cleanKey = (value: string) => value.replace(/[^\x20-\x7E]/g, '').trim();

export function loadJSON<T>(key: string, fallback: T): T {
  try {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : fallback;
  } catch {
    return fallback;
  }
}

export function saveJSON(key: string, value: any) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

const debounceTimers: Record<string, ReturnType<typeof setTimeout>> = {};

export function debouncedSaveJSON(key: string, value: any, ms = 300) {
  clearTimeout(debounceTimers[key]);
  debounceTimers[key] = setTimeout(() => saveJSON(key, value), ms);
}
