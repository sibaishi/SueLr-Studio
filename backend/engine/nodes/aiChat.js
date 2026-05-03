import { fileToBase64 } from '../helpers/fileHelper.js';
import { resolveRuntimeApiConfig } from '../helpers/apiConfig.js';
import { runChatCompletion } from '../../services/chatService.js';
import { formatWebSearchResult, runWebSearch } from '../../services/searchService.js';

function normalizeTextInput(value) {
  if (Array.isArray(value)) {
    return value.filter((item) => item !== undefined && item !== null && item !== '').join('\n');
  }
  return String(value || '').trim();
}

async function buildMessageContent(text, inputs) {
  const parts = [];

  if (text) {
    parts.push({ type: 'text', text });
  }

  const images = inputs.image ? (Array.isArray(inputs.image) ? inputs.image : [inputs.image]) : [];
  for (const imageUrl of images) {
    if (!imageUrl) continue;
    const base64 = await fileToBase64(imageUrl);
    parts.push({ type: 'image_url', image_url: { url: base64 } });
  }

  if (parts.length === 1 && parts[0].type === 'text') {
    return parts[0].text;
  }

  return parts;
}

async function parseChatResponse(response) {
  const data = await response.json();
  const message = data.choices?.[0]?.message || {};
  return {
    data,
    message,
    content: typeof message.content === 'string' ? message.content : '',
    toolCalls: Array.isArray(message.tool_calls) ? message.tool_calls : [],
  };
}

function stringifyPromptForSearch(content) {
  if (typeof content === 'string') return content.trim();
  if (!Array.isArray(content)) return '';
  return content
    .filter((part) => part?.type === 'text' && part.text)
    .map((part) => String(part.text).trim())
    .filter(Boolean)
    .join('\n');
}

function getShanghaiDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const year = parts.find((part) => part.type === 'year')?.value || '';
  const month = parts.find((part) => part.type === 'month')?.value || '';
  const day = parts.find((part) => part.type === 'day')?.value || '';
  return { year, month, day };
}

function buildAbsoluteDateText(offsetDays = 0) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  const { year, month, day } = getShanghaiDateParts(date);
  if (!year || !month || !day) return '';
  return `${year}-${month}-${day}`;
}

function buildSearchPlan(text) {
  const cleanText = String(text || '').trim();
  if (!cleanText) return null;

  const isNewsIntent = /(新闻|时讯|快讯|头条|资讯|报道|国际时讯|国际新闻)/.test(cleanText);
  const normalized = cleanText.replace(/\s+/g, ' ').trim();

  if (/(今天|今日|当天)/.test(normalized)) {
    const dateText = buildAbsoluteDateText(0);
    return {
      query: normalized.replace(/今天|今日|当天/g, dateText),
      topic: isNewsIntent ? 'news' : undefined,
      days: 1,
      dateHint: dateText,
    };
  }

  if (/昨天/.test(normalized)) {
    const dateText = buildAbsoluteDateText(-1);
    return {
      query: normalized.replace(/昨天/g, dateText),
      topic: isNewsIntent ? 'news' : undefined,
      days: 2,
      dateHint: dateText,
    };
  }

  if (/(最新|最近|刚刚|目前|当前|现在)/.test(normalized)) {
    const dateText = buildAbsoluteDateText(0);
    return {
      query: `${normalized} ${dateText}`,
      topic: isNewsIntent ? 'news' : undefined,
      days: isNewsIntent ? 3 : 7,
      dateHint: dateText,
    };
  }

  return {
    query: normalized,
    topic: isNewsIntent ? 'news' : undefined,
    days: undefined,
    dateHint: '',
  };
}

function normalizeTemperature(value) {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.min(2, Math.max(0, parsed));
}

function normalizeMaxTokens(value) {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return Math.max(1, Math.floor(parsed));
}

export async function execute(node, inputs, apiConfig, sendProgress) {
  const runtimeConfig = resolveRuntimeApiConfig(inputs, apiConfig);
  const { apiKey, baseUrl, providerConfig, projectModels } = runtimeConfig;

  if (!apiKey) {
    throw new Error('未配置 API Key，请先在设置页或 API Key 节点中填写。');
  }

  const prompt = normalizeTextInput(inputs.prompt);
  if (!prompt && !inputs.image) {
    throw new Error('未提供任何输入，请连接输入节点。');
  }

  const model = runtimeConfig.model || node.data?.model || 'gpt-4o-mini';
  const systemPrompt = node.data?.systemPrompt || '你是一个有帮助的 AI 助手。';
  const temperature = normalizeTemperature(node.data?.temperature);
  const maxTokens = normalizeMaxTokens(node.data?.maxTokens);

  sendProgress?.('正在准备输入内容...');
  const userContent = await buildMessageContent(prompt, inputs);
  const enableWebSearch = Boolean(node.data?.enableWebSearch);
  const tavilyKey = String(apiConfig.tavilyApiKey || '').trim();

  if (enableWebSearch && !tavilyKey) {
    throw new Error('AI 对话节点已开启联网搜索，但未配置 Tavily API Key');
  }

  let content = '';

  if (enableWebSearch) {
    const searchPlan = buildSearchPlan(stringifyPromptForSearch(userContent));
    if (!searchPlan?.query) {
      throw new Error('已开启联网搜索，但无法从输入中提取搜索词');
    }

    sendProgress?.(`正在联网搜索：${searchPlan.query}`);
    const searchData = await runWebSearch({
      tavilyApiKey: tavilyKey,
      query: searchPlan.query,
      maxResults: 5,
      includeAnswer: true,
      topic: searchPlan.topic,
      days: searchPlan.days,
      signal: apiConfig.abortSignal,
    });
    const searchContext = formatWebSearchResult(searchData) || '搜索未返回任何结果。';

    const messages = [
      {
        role: 'system',
        content: [
          systemPrompt,
          '已为你提供联网搜索结果。请优先基于这些结果回答；若结果不足或互相冲突，请明确说明不确定性，不要编造。',
        ].filter(Boolean).join('\n\n'),
      },
      {
        role: 'user',
        content: [
          '【用户原始请求】',
          stringifyPromptForSearch(userContent),
          '',
          '【实际搜索词】',
          searchPlan.query,
          searchPlan.dateHint ? `时间锚点：${searchPlan.dateHint}` : '',
          '',
          '【联网搜索结果】',
          searchContext,
          '',
          '请结合以上搜索结果回答用户问题。',
        ].join('\n'),
      },
    ];

    sendProgress?.('正在基于搜索结果生成最终回答...');
    const finalResponse = await runChatCompletion({
      apiKey,
      baseUrl,
      providerConfig,
      projectModels,
      model,
      messages,
      temperature,
      maxTokens,
      tools: undefined,
      stream: false,
      signal: apiConfig.abortSignal,
    });
    const finalResult = await parseChatResponse(finalResponse);
    content = finalResult.content;
  } else {
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ];

    sendProgress?.('正在调用 AI 模型...');
    const response = await runChatCompletion({
      apiKey,
      baseUrl,
      providerConfig,
      projectModels,
      model,
      messages,
      temperature,
      maxTokens,
      tools: undefined,
      stream: false,
      signal: apiConfig.abortSignal,
    });

    const result = await parseChatResponse(response);
    content = result.content;
  }

  if (!content) {
    throw new Error('AI 返回了空内容');
  }

  return { response: content };
}
