import { fetchRemoteDownload, readDownloadBuffer } from '../../platform/http/remote-download.ts';
import {
  type DynamicValue,
  type LooseRecord,
  type ProgressCallback,
  REMOTE_IMAGE_DOWNLOAD_TIMEOUT_MS,
  REMOTE_IMAGE_MAX_BYTES,
  describeFetchError,
  fetchWithImageTimeout,
  logOutgoingRequest,
  parseApiError,
  parseImageApiResponse,
  summarizeFormData,
} from './imageGenShared.ts';

export function dataUrlToBlob(dataUrl: DynamicValue): Blob {
  const matches = String(dataUrl).match(/^data:([^;]+);base64,(.+)$/);
  if (!matches) {
    return new Blob([dataUrl], { type: 'application/octet-stream' });
  }
  const mime = matches[1] || 'application/octet-stream';
  const buffer = Buffer.from(matches[2], 'base64');
  return new Blob([buffer], { type: mime });
}

export async function imageSourceToBlob(imageSource: DynamicValue): Promise<Blob | null> {
  if (!imageSource) return null;
  if (String(imageSource).startsWith('data:')) {
    return dataUrlToBlob(imageSource);
  }
  if (String(imageSource).startsWith('http://') || String(imageSource).startsWith('https://')) {
    const response = await fetchRemoteDownload(imageSource, '编辑图片地址', AbortSignal.timeout(REMOTE_IMAGE_DOWNLOAD_TIMEOUT_MS));
    if (!response.ok) {
      throw new Error(`下载编辑图片失败: HTTP ${response.status}`);
    }

    const buffer = await readDownloadBuffer(response, REMOTE_IMAGE_MAX_BYTES, '下载编辑图片失败: 文件超过大小限制');

    return new Blob([buffer], {
      type: response.headers.get('content-type') || 'application/octet-stream',
    });
  }
  return new Blob([imageSource], { type: 'application/octet-stream' });
}

export async function callImageEditApiWithAdapter(
  request: LooseRecord,
  payload: LooseRecord,
  timeoutMs: number,
  sendProgress: ProgressCallback,
  externalSignal: AbortSignal | undefined,
) {
  sendProgress?.(`正在调用图像编辑接口: ${request.url}`);
  logOutgoingRequest(sendProgress, {
    type: 'form-data',
    url: request.url,
    method: 'POST',
    body: summarizeFormData(request.options.body),
  });

  let response: Response;
  try {
    response = await fetchWithImageTimeout(request.url, request.options, timeoutMs, externalSignal, sendProgress);
  } catch (error) {
    throw new Error(`图像编辑请求失败: model=${payload.model}; timeoutMs=${timeoutMs}; ${describeFetchError(error)}`);
  }
  if (!response.ok) {
    const errorMessage = await parseApiError(response);
    throw new Error(`图像编辑 API 调用失败 (${response.status}): ${errorMessage}`);
  }
  return parseImageApiResponse(response, '图像编辑', sendProgress);
}
