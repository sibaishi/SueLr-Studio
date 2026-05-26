import {
  type UploadedFileMetadataResult,
  fetchUploadedFileMetadata,
  getUploadedFilenameFromUrl,
} from '@/domains/workflow/lib/api';

const POLL_INTERVAL_MS = 1200;
const POLL_TIMEOUT_MS = 45000;

export async function waitForUploadedImageMetadata(
  fileUrl: string,
  onProgress?: (result: UploadedFileMetadataResult) => void,
) {
  const filename = getUploadedFilenameFromUrl(fileUrl);
  if (!filename) return null;

  const startedAt = Date.now();
  while (Date.now() - startedAt < POLL_TIMEOUT_MS) {
    const result = await fetchUploadedFileMetadata(filename);
    if (!result.success) {
      await delay(POLL_INTERVAL_MS);
      continue;
    }

    onProgress?.(result);
    if (result.processingStatus === 'completed' || result.processingStatus === 'failed') {
      return result;
    }

    await delay(POLL_INTERVAL_MS);
  }

  return null;
}

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
