import { API_BASE, workflowApiFetch } from '@/domains/workflow/lib/api/base';
import { apiRequest } from '@/shared/api';

export interface UploadResult {
  success: boolean;
  url?: string;
  thumbnailUrl?: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  width?: number;
  height?: number;
  processing?: boolean;
  processingStatus?: 'processing' | 'completed' | 'failed';
  processingError?: string;
  error?: string;
}

export interface UploadedFileMetadataResult extends UploadResult {}

export interface GeneratedOutputFile {
  id: string;
  name: string;
  relativePath: string;
  url: string;
  thumbnailUrl?: string;
  type: 'image' | 'video' | 'audio' | 'text' | 'data' | 'file';
  mimeType: string;
  width?: number;
  height?: number;
  size: number;
  modifiedAt: number;
}

export async function fetchGeneratedOutputs() {
  return workflowApiFetch<GeneratedOutputFile[]>('/files/generated');
}

export async function clearGeneratedOutputs() {
  return workflowApiFetch<{ removed: number }>('/files/generated', {
    method: 'DELETE',
  });
}

export async function uploadFile(file: File): Promise<UploadResult> {
  const formData = new FormData();
  formData.append('file', file);

  try {
    const result = await apiRequest<{
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
    }>(`${API_BASE}/files/upload`, {
      method: 'POST',
      body: formData,
      skipJsonContentType: true,
    });

    if (result.success && result.data) {
      return {
        success: true,
        url: result.data.url,
        thumbnailUrl: result.data.thumbnailUrl,
        fileName: result.data.fileName,
        fileSize: result.data.fileSize,
        mimeType: result.data.mimeType,
        width: result.data.width,
        height: result.data.height,
        processing: result.data.processing,
        processingStatus: result.data.processingStatus,
        processingError: result.data.processingError,
      };
    }

    return { success: false, error: result.error || '上传失败' };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '上传失败';
    if (message.includes('Failed to fetch') || message.includes('NetworkError')) {
      return { success: false, error: '无法连接到后端服务，请确认后端已经启动。' };
    }
    return { success: false, error: message };
  }
}

export function getUploadedFilenameFromUrl(url: string) {
  const match = String(url || '').match(/\/api\/files\/([^/?#]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}

export async function fetchUploadedFileMetadata(filename: string): Promise<UploadedFileMetadataResult> {
  try {
    const result = await apiRequest<{
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
    }>(`${API_BASE}/files/${encodeURIComponent(filename)}/metadata`, {
      method: 'GET',
    });

    if (result.success && result.data) {
      return {
        success: true,
        url: result.data.url,
        thumbnailUrl: result.data.thumbnailUrl,
        fileName: result.data.fileName,
        fileSize: result.data.fileSize,
        mimeType: result.data.mimeType,
        width: result.data.width,
        height: result.data.height,
        processing: result.data.processing,
        processingStatus: result.data.processingStatus,
        processingError: result.data.processingError,
      };
    }

    return { success: false, error: result.error || '读取上传文件元数据失败' };
  } catch (error: unknown) {
    return {
      success: false,
      error: error instanceof Error ? error.message : '读取上传文件元数据失败',
    };
  }
}
