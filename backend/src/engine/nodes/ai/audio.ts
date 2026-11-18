import { ProviderError } from '../../../app/errors/index.ts';
import { readDownloadBuffer } from '../../../platform/http/remote-download.ts';
import { getProviderAdapter } from '../../../platform/providers/index.ts';
import { resolveModelRuntime, type resolveRuntimeApiConfig } from '../../helpers/apiConfig.ts';
import type { ProgressCallback, RuntimeApiConfig } from '../types.ts';

const AUDIO_TIMEOUT_MS = 120_000;
const AUDIO_MAX_BYTES = 25 * 1024 * 1024;

export async function executeAudioMode(
  prompt: string,
  nodeData: Record<string, unknown>,
  runtimeConfig: ReturnType<typeof resolveRuntimeApiConfig>,
  { abortSignal }: RuntimeApiConfig,
  sendProgress: ProgressCallback,
) {
  const input = prompt.trim();
  if (!input) throw new Error('请输入要合成的文本，或连接上游文本节点。');

  const { model, endpoint } = resolveModelRuntime(runtimeConfig, runtimeConfig.model, {
    expectedType: 'audio',
    purpose: 'audio',
  });
  const voice = typeof nodeData.voice === 'string' ? nodeData.voice.trim() || 'alloy' : 'alloy';
  const timeout = AbortSignal.timeout(AUDIO_TIMEOUT_MS);
  const signal = abortSignal ? AbortSignal.any([abortSignal, timeout]) : timeout;
  sendProgress?.('正在合成语音...');
  const response = await getProviderAdapter().jsonRequest({
    apiKey: runtimeConfig.apiKey,
    baseUrl: String(runtimeConfig.baseUrl || ''),
    providerConfig: runtimeConfig.providerConfig,
    endpoint,
    body: { model: model.modelId, input, voice, response_format: 'mp3' },
    signal,
    errorCode: 'AUDIO_SPEECH_FAILED',
  });
  const mime = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  if (mime && !['audio/mpeg', 'audio/mp3', 'application/octet-stream'].includes(mime)) {
    await response.body?.cancel();
    throw new ProviderError('AUDIO_RESULT_INVALID', '语音合成接口未返回 MP3 音频');
  }
  const audio = await readDownloadBuffer(response, AUDIO_MAX_BYTES, '语音合成结果超过 25 MB');
  const isMp3 =
    audio.length >= 4 && (audio.toString('ascii', 0, 3) === 'ID3' || (audio[0] === 0xff && (audio[1] & 0xe0) === 0xe0));
  if (!isMp3) throw new ProviderError('AUDIO_RESULT_INVALID', '语音合成接口未返回有效的 MP3 音频');
  return { result: `data:audio/mpeg;base64,${audio.toString('base64')}` };
}
