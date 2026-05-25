import { apiRequestOrThrow } from './client';

export type UploadedFile = {
  url: string;
  thumbnailUrl?: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  width?: number;
  height?: number;
  processing?: boolean;
  processingStatus?: 'processing' | 'completed' | 'failed';
  processingError?: string;
};

export async function uploadFile(file: File): Promise<UploadedFile> {
  const formData = new FormData();
  formData.append('file', file);

  return apiRequestOrThrow<UploadedFile>('/api/files/upload', {
    method: 'POST',
    body: formData,
    skipJsonContentType: true,
  });
}

export async function fetchUploadedFileMetadata(filename: string): Promise<UploadedFile> {
  return apiRequestOrThrow<UploadedFile>(`/api/files/${encodeURIComponent(filename)}/metadata`, {
    method: 'GET',
  });
}

export function getFilenameFromFileUrl(url: string) {
  const match = String(url || '').match(/\/api\/files\/([^/?#]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}
