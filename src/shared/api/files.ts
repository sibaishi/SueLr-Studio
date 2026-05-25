import { apiRequestOrThrow } from './client';

export type UploadedFile = {
  url: string;
  thumbnailUrl?: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  width?: number;
  height?: number;
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
