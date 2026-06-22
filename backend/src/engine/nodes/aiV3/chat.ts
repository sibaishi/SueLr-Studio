import { runChatCompletion } from '../../../platform/ai/chat-service.ts';
import { formatWebSearchResult, runWebSearch } from '../../../platform/ai/search-service.ts';
import type { resolveRuntimeApiConfig } from '../../helpers/apiConfig.ts';
import { cleanModelText } from '../cleanModelText.ts';
import type { DynamicValue, ProgressCallback, RuntimeApiConfig } from '../types.ts';
import { buildChatContent, buildSearchPlan, parseChatResult, stringifyForSearch } from './helpers.ts';

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
  const enableWebSearch = Boolean(nodeData.enableWebSearch);
  const tavilyKey = String(apiConfig.tavilyApiKey || '').trim();

  const prependSystem = (userPart: DynamicValue): DynamicValue => {
    const sp = systemPrompt || '';
    if (typeof userPart === 'string') return sp ? `${sp}\n${userPart}` : userPart;
    if (Array.isArray(userPart)) return sp ? [{ type: 'text', text: `${sp}\n` }, ...userPart] : userPart;
    return userPart;
  };

  if (enableWebSearch && !tavilyKey) throw new Error('已开启联网搜索，但未配置 Tavily API Key');

  sendProgress?.('正在准备输入...');
  const rawContent = await buildChatContent(prompt, images, apiConfig.scope);

  if (enableWebSearch) {
    const plan = buildSearchPlan(stringifyForSearch(rawContent));
    if (!plan?.query) throw new Error('已开启联网搜索，但无法从输入中提取搜索词');
    sendProgress?.(`正在联网搜索：${plan.query}`);
    const searchData = await runWebSearch({
      tavilyApiKey: tavilyKey,
      query: plan.query,
      maxResults: 5,
      includeAnswer: true,
      topic: plan.topic as string | undefined,
      days: plan.days as number | undefined,
      signal: apiConfig.abortSignal,
    });
    const ctx = String(formatWebSearchResult(searchData) || '搜索未返回任何结果。');
    const instructions =
      '已为你提供联网搜索结果。请优先基于这些结果回答；若结果不足或互相冲突，请明确说明不确定性，不要编造。';
    const searchMsg = [
      '【用户原始请求】',
      stringifyForSearch(rawContent),
      '',
      '【实际搜索词】',
      plan.query,
      plan.dateHint ? `时间锚点：${plan.dateHint}` : '',
      '',
      '【联网搜索结果】',
      ctx,
      '',
      instructions,
    ]
      .filter(Boolean)
      .join('\n');
    const { apiKey, providerConfig, projectModels } = runtimeConfig;
    const baseUrl = String(runtimeConfig.baseUrl || '');
    sendProgress?.('正在生成回答...');
    const resp = await runChatCompletion({
      apiKey,
      baseUrl,
      providerConfig,
      projectModels,
      model,
      messages: [{ role: 'user', content: prependSystem(searchMsg) }],
      tools: undefined,
      stream: false,
      signal: apiConfig.abortSignal,
      scope: apiConfig.scope,
    });
    const result = await parseChatResult(resp);
    if (!result.content) throw new Error('AI 返回了空内容');
    return { result: cleanModelText(result.content) };
  }

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
    tools: undefined,
    stream: false,
    signal: apiConfig.abortSignal,
    scope: apiConfig.scope,
  });
  const result = await parseChatResult(resp);
  if (!result.content) throw new Error('AI 返回了空内容');
  return { result: cleanModelText(result.content) };
}
