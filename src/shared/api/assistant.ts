import { apiRequest, isBackendAvailable } from '@/shared/api';
import type { Conv, GalleryItem } from '@/shared/types';

const API = '/api/assistant';

function getResultData<T>(result: { success: boolean; data?: T }): T | null {
  return result.success && result.data ? result.data : null;
}

function normalizeGalleryItems(items: unknown[]): GalleryItem[] {
  if (!Array.isArray(items)) return [];
  const normalized: Array<GalleryItem | null> = items.map((item) => {
    if (!item || typeof item !== 'object') return null;
    const record = item as Record<string, unknown>;
    const url = String(record.localUrl || record.url || '');
    if (!url) return null;
    return {
      id: String(record.id || ''),
      url,
      thumbnailUrl: String(record.thumbnailUrl || ''),
      prompt: String(record.prompt || ''),
      model: String(record.model || ''),
      ts: Number(record.ts || Date.now()),
    };
  });

  return normalized.filter((item): item is GalleryItem => item !== null);
}

export async function loadConversations(): Promise<Conv[]> {
  if (!isBackendAvailable()) return [];
  const result = await apiRequest<Conv[]>(`${API}/conversations`);
  return getResultData(result) ?? [];
}

export async function saveConversations(convs: Conv[]): Promise<void> {
  if (!isBackendAvailable() || convs.length === 0) return;
  await apiRequest(`${API}/conversations`, {
    method: 'POST',
    body: JSON.stringify(convs),
  });
}

export async function deleteConversation(id: string): Promise<void> {
  if (!isBackendAvailable()) return;
  await apiRequest(`${API}/conversations/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function saveImage(item: {
  id: string;
  data?: string;
  url?: string;
  prompt: string;
  model: string;
  ts: number;
}): Promise<{ localUrl: string | null; thumbnailUrl?: string | null }> {
  if (!isBackendAvailable()) return { localUrl: null, thumbnailUrl: null };
  const result = await apiRequest<{ localUrl?: string; thumbnailUrl?: string }>(`${API}/images`, {
    method: 'POST',
    body: JSON.stringify(item),
  });
  const data = getResultData(result);
  return { localUrl: data?.localUrl ?? null, thumbnailUrl: data?.thumbnailUrl ?? null };
}

export async function loadGallery(): Promise<GalleryItem[]> {
  if (!isBackendAvailable()) return [];
  const result = await apiRequest<unknown[]>(`${API}/images`);
  return normalizeGalleryItems(getResultData(result) ?? []);
}

export async function clearGallery(): Promise<void> {
  if (!isBackendAvailable()) return;
  await apiRequest(`${API}/images`, { method: 'DELETE' });
}

export async function saveVideo(item: {
  id: string;
  url?: string;
  localUrl?: string;
  data?: string;
  candidateUrls?: string[];
  prompt: string;
  model: string;
  ts: number;
}): Promise<string | null> {
  if (!isBackendAvailable()) return null;
  const result = await apiRequest<{ localUrl?: string }>(`${API}/videos`, {
    method: 'POST',
    body: JSON.stringify(item),
  });
  return getResultData(result)?.localUrl ?? null;
}

export async function loadVideos(): Promise<GalleryItem[]> {
  if (!isBackendAvailable()) return [];
  const result = await apiRequest<unknown[]>(`${API}/videos`);
  return normalizeGalleryItems(getResultData(result) ?? []);
}

export async function clearVideos(): Promise<void> {
  if (!isBackendAvailable()) return;
  await apiRequest(`${API}/videos`, { method: 'DELETE' });
}
