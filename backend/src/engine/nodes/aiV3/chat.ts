import { runChatCompletion } from '../../../platform/ai/chat-service.ts';
import type { resolveRuntimeApiConfig } from '../../helpers/apiConfig.ts';
import { cleanModelText } from '../cleanModelText.ts';
import type { DynamicValue, ProgressCallback, RuntimeApiConfig } from '../types.ts';
import { buildChatContent, parseChatResult } from './helpers.ts';

export async function executeChatMode(
  prompt: string,
  images: DynamicValue[],
  nodeData: Record<string, unknown>,
  runtimeConfig: ReturnType<typeof resolveRuntimeApiConfig>,
  apiConfig: RuntimeApiConfig,
  sendProgress: ProgressCallback,
) {
  const model = String(runtimeConfig.model || nodeData.model || 'gpt-4o-mini');
  const systemPrompt = String(nodeData.systemPrompt || '你是一个有帮助的 AI 助手。');
  const prependSystem = (userPart: DynamicValue): DynamicValue => {
    const sp = systemPrompt || '';
    if (typeof userPart === 'string') return sp ? `${sp}\n${userPart}` : userPart;
    if (Array.isArray(userPart)) return sp ? [{ type: 'text', text: `${sp}\n` }, ...userPart] : userPart;
    return userPart;
  };

  sendProgress?.('正在准备输入...');
  const rawContent = await buildChatContent(prompt, images, apiConfig.scope);

  const { apiKey, providerConfig, projectModels } = runtimeConfig;
  const baseUrl = String(runtimeConfig.baseUrl || '');
  sendProgress?.('正在调用 AI 模型...');
  const resp = await runChatCompletion({
    apiKey,
    baseUrl,
    providerConfig,
    projectModels,
    model,
    messages: [{ role: 'user', content: prependSystem(rawContent) }],
    webSearch: nodeData.enableWebSearch === true,
    stream: false,
    signal: apiConfig.abortSignal,
    scope: apiConfig.scope,
  });
  const result = await parseChatResult(resp);
  if (!result.content) throw new Error('AI 返回了空内容');
  return { result: cleanModelText(result.content) };
}
