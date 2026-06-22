import { workflowApiFetch } from '@/domains/workflow/lib/api/base';
import {
  type UploadedFile,
  fetchUploadedFileMetadata as fetchUploadedFileMetadataOrThrow,
  getFilenameFromFileUrl,
  uploadFile as uploadFileOrThrow,
} from '@/shared/api/files';

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
  try {
    return { success: true, ...(await uploadFileOrThrow(file)) };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '上传失败';
    if (message.includes('Failed to fetch') || message.includes('NetworkError')) {
      return { success: false, error: '无法连接到后端服务，请确认后端已经启动。' };
    }
    return { success: false, error: message };
  }
}

export function getUploadedFilenameFromUrl(url: string) {
  return getFilenameFromFileUrl(url);
}

export async function fetchUploadedFileMetadata(filename: string): Promise<UploadedFileMetadataResult> {
  try {
    return { success: true, ...(await fetchUploadedFileMetadataOrThrow(filename)) };
  } catch (error: unknown) {
    return {
      success: false,
      error: error instanceof Error ? error.message : '读取上传文件元数据失败',
    };
  }
}

export type { UploadedFile };
