import { apiRequest } from '@/shared/api';

export const API_BASE = import.meta.env.VITE_API_BASE || '/api';

export async function workflowApiFetch<T = unknown>(path: string, options: RequestInit = {}) {
  return apiRequest<T>(`${API_BASE}${path}`, options);
}
