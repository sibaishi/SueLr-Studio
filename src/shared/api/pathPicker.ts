import { apiRequest } from './client';
import { getCachedRuntimeCapabilities } from './serverState';

const API_BASE = import.meta.env.VITE_API_BASE || '/api';

export type DirectoryPickerResult = {
  path: string | null;
};

export async function selectDirectory(): Promise<string | null> {
  const runtime = getCachedRuntimeCapabilities();
  if (runtime && !runtime.canSelectDirectory) {
    throw new Error('当前运行模式不支持目录选择');
  }

  const result = await apiRequest<DirectoryPickerResult>(`${API_BASE}/settings/select-directory`, {
    method: 'POST',
    body: JSON.stringify({}),
  });

  if (!result.success) {
    throw new Error(result.error || '选择目录失败');
  }

  return result.data?.path ?? null;
}
