import { workflowApiFetch } from './base';

export interface LibraryAsset {
  id: string;
  name: string;
  originalName: string;
  source: 'uploaded' | 'generated';
  type: 'image' | 'video' | 'audio' | 'text' | 'data' | 'file';
  mimeType: string;
  url: string;
  thumbnailUrl: string;
  size: number;
  modifiedAt: number;
  category: string;
  tags: string[];
  favorite: boolean;
}
export interface AssetPage {
  items: LibraryAsset[];
  total: number;
  page: number;
  pageSize: number;
  categories: string[];
  libraryTotal: number;
}
export type AssetMetadata = Pick<LibraryAsset, 'name' | 'category' | 'tags' | 'favorite'>;
export function fetchAssets(query: URLSearchParams, signal?: AbortSignal) {
  return workflowApiFetch<AssetPage>(`/assets?${query}`, { signal });
}
export function updateAsset(id: string, metadata: Partial<AssetMetadata>) {
  return workflowApiFetch<LibraryAsset>(`/assets/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(metadata),
  });
}
