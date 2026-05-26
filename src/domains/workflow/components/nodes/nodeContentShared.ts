export function getUploadProcessingState(data: Record<string, unknown>) {
  return {
    processingStatus: (data._fileProcessingStatus as string) || '',
    processingError: (data._fileProcessingError as string) || '',
  };
}

export function getUploadStatusText({
  uploadError,
  uploading,
  fileUrl,
  previewUrl,
  processingStatus,
  processingError,
}: {
  uploadError: string;
  uploading: boolean;
  fileUrl: string;
  previewUrl: string;
  processingStatus: string;
  processingError: string;
}) {
  if (uploadError) return '上传失败';
  if (uploading) return '上传中';
  if (processingStatus === 'processing') return '上传完成，正在处理预览';
  if (processingStatus === 'failed') return '处理失败，已回退原图';
  if (processingStatus === 'completed') return '处理完成';
  if (processingError) return '处理失败，已回退原图';
  if (fileUrl) return '已上传';
  if (previewUrl) return '本地预览';
  return '未选择';
}

export function getUploadStatusClassName({
  uploadError,
  uploading,
  processingStatus,
  processingError,
}: {
  uploadError: string;
  uploading: boolean;
  processingStatus: string;
  processingError: string;
}) {
  if (uploadError || processingStatus === 'failed' || processingError) {
    return 'node-file-status__state node-file-status__state--error';
  }
  if (uploading || processingStatus === 'processing') {
    return 'node-file-status__state node-file-status__state--loading';
  }
  return 'node-file-status__state';
}
