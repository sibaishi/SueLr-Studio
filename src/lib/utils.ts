import type { Colors } from './types';

export const gid = () => Date.now().toString(36) + Math.random().toString(36).slice(2);
export const ftime = (t: number) => new Date(t).toLocaleTimeString('zh-CN');
export const cleanKey = (s: string) => s.replace(/[^\x20-\x7E]/g, '').trim();
export const logLevelColor = (level: string, T: Colors) =>
  level === 'success' ? T.green : level === 'error' ? T.red : level === 'warn' ? T.orange : level === 'debug' ? T.text3 : T.blue;
export const catModel = (id: string): 'chat' | 'image' | 'video' => {
  if (id.includes('seedance')) return 'video';
  if (id.includes('seedream') || id.includes('image') || id.includes('banana')) return 'image';
  return 'chat';
};
export const taskStatusColor = (s: string, T: Colors) =>
  s === 'queued' || s === '提交中' ? T.orange : s === 'processing' || s === '处理中' ? T.blue : s === 'done' || s === '已完成' ? T.green : s === 'failed' || s === '失败' ? T.red : T.text3;
export const taskStatusLabel = (s: string) =>
  s === 'queued' ? '排队中' : s === 'processing' ? '生成中' : s === 'done' ? '已完成' : s === 'failed' ? '失败' : s === '已取消' ? '已取消' : s;

export function loadJSON<T>(k: string, fb: T): T {
  try {
    const d = localStorage.getItem(k);
    return d ? JSON.parse(d) : fb;
  } catch {
    return fb;
  }
}

export function saveJSON(k: string, v: any) {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {}
}

const debounceTimers: Record<string, any> = {};
export function debouncedSaveJSON(k: string, v: any, ms = 300) {
  clearTimeout(debounceTimers[k]);
  debounceTimers[k] = setTimeout(() => saveJSON(k, v), ms);
}
