import { apiRequest } from './client';

const API_BASE = import.meta.env.VITE_API_BASE || '/api';

export type DirectoryPickerResult = {
  path: string | null;
};

export async function selectDirectory(): Promise<string | null> {
  const result = await apiRequest<DirectoryPickerResult>(`${API_BASE}/settings/select-directory`, {
    method: 'POST',
    body: JSON.stringify({}),
  });

  if (!result.success) {
    throw new Error(result.error || '选择目录失败');
  }

  return result.data?.path ?? null;
}
