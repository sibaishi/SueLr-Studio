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

export const taskStatusColor = (s: string, T: Colors) => {
  if (['queued', 'pending', 'submitted', 'created', '提交中'].includes(s)) return T.orange;
  if (['processing', 'running', 'in_progress', 'in-progress', '处理中'].includes(s)) return T.blue;
  if (['done', 'completed', 'complete', 'success', 'succeeded', 'finished', '已完成'].includes(s)) return T.green;
  if (['failed', 'error', 'errored', '失败'].includes(s)) return T.red;
  return T.text3;
};

export const taskStatusLabel = (s: string) => {
  if (['queued', 'pending', 'submitted', 'created'].includes(s)) return '排队中';
  if (['processing', 'running', 'in_progress', 'in-progress'].includes(s)) return '生成中';
  if (['done', 'completed', 'complete', 'success', 'succeeded', 'finished'].includes(s)) return '已完成';
  if (['failed', 'error', 'errored'].includes(s)) return '失败';
  if (['cancelled', 'canceled', 'aborted', '已取消'].includes(s)) return '已取消';
  return s;
};

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
