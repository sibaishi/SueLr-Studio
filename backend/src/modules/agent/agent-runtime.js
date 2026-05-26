import { randomUUID } from 'node:crypto';
import { AgentMemoryStrategy } from './agent-memory-strategy.js';

const DEFAULT_CONTEXT_COMPRESSION_THRESHOLD = 128000;
const CHARS_PER_TOKEN = 3.5;
const IMAGE_TOKEN_ESTIMATE = 768;
const TERMINAL_SIDE_EFFECT_TOOLS = new Set(['generate_image', 'video_generate']);

function cleanString(value, maxLength = 5000) {
  if (value === undefined || value === null) return '';
  return String(value).trim().slice(0, maxLength);
}

function estimateTextTokens(value) {
  const text = String(value || '').trim();
  if (!text) return 0;
  return Math.max(1, Math.round(text.length / CHARS_PER_TOKEN));
}

function estimateContentTokens(content) {
  if (typeof content === 'string') return estimateTextTokens(content);
  if (!Array.isArray(content)) return 0;
  return content.reduce((sum, part) => {
    if (typeof part === 'string') return sum + estimateTextTokens(part);
    if (!part || typeof part !== 'object') return sum;
    if (part.type === 'text') return sum + estimateTextTokens(part.text);
    if (part.type === 'image_url') return sum + IMAGE_TOKEN_ESTIMATE;
    return sum + estimateTextTokens(JSON.stringify(part));
  }, 0);
}

function estimateMessageTokens(message) {
  if (!message || typeof message !== 'object') return 0;
  const roleTokens = estimateTextTokens(message.role);
  const contentTokens = estimateContentTokens(message.content);
  const toolTokens = message.tool_calls ? estimateTextTokens(JSON.stringify(message.tool_calls)) : 0;
  const toolCallIdTokens = message.tool_call_id ? estimateTextTokens(message.tool_call_id) : 0;
  return roleTokens + contentTokens + toolTokens + toolCallIdTokens + 4;
}

function estimateMessagesTokens(messages = []) {
  return (Array.isArray(messages) ? messages : []).reduce((sum, message) => sum + estimateMessageTokens(message), 0);
}

function normalizeUsageNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.round(number) : undefined;
}

function buildTokenUsage({
  promptMessages = [],
  completionMessage = null,
  upstreamUsage = null,
  threshold = DEFAULT_CONTEXT_COMPRESSION_THRESHOLD,
  source = 'estimate',
} = {}) {
  const upstreamPromptTokens = normalizeUsageNumber(upstreamUsage?.prompt_tokens ?? upstreamUsage?.input_tokens);
  const upstreamCompletionTokens = normalizeUsageNumber(upstreamUsage?.completion_tokens ?? upstreamUsage?.output_tokens);
  const upstreamTotalTokens = normalizeUsageNumber(upstreamUsage?.total_tokens);
  const promptTokens = upstreamPromptTokens ?? estimateMessagesTokens(promptMessages);
  const completionTokens = upstreamCompletionTokens ?? estimateMessageTokens(completionMessage);
  const totalTokens = upstreamTotalTokens ?? promptTokens + completionTokens;
  const compressionThreshold = normalizeUsageNumber(threshold) || DEFAULT_CONTEXT_COMPRESSION_THRESHOLD;
  const usagePct = Math.min(100, Math.round((totalTokens / compressionThreshold) * 100));

  return {
    source: upstreamUsage ? 'provider' : source,
    promptTokens,
    completionTokens,
    totalTokens,
    compressionThreshold,
    remainingTokens: Math.max(0, compressionThreshold - totalTokens),
    usagePct,
  };
}

function parseToolArguments(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function normalizeToolCalls(toolCalls = []) {
  const valid = [];
  const invalid = [];

  for (const toolCall of Array.isArray(toolCalls) ? toolCalls : []) {
    const name = cleanString(toolCall?.function?.name, 120);
    if (!name) {
      invalid.push(toolCall);
      continue;
    }
    valid.push({
      ...toolCall,
      function: {
        ...toolCall.function,
        name,
      },
    });
  }

  return { valid, invalid };
}

function extractChatResponse(payload) {
  const choice = payload?.choices?.[0] || {};
  const message = choice.message || {};
  const content = typeof message.content === 'string' ? message.content : '';
  const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
  return {
    raw: payload,
    content,
    toolCalls,
    finishReason: choice.finish_reason || 'stop',
    usage: payload?.usage || null,
  };
}

function mergeToolCalls(target, incoming = []) {
  for (const item of incoming) {
    const index = Number.isInteger(item?.index) ? item.index : target.length;
    const current = target[index] || {
      id: item?.id || `tool_${index}`,
      type: 'function',
      function: { name: '', arguments: '' },
    };
    current.id = item?.id || current.id;
    current.type = item?.type || current.type || 'function';
    current.function = current.function || { name: '', arguments: '' };
    if (item?.function?.name) current.function.name = item.function.name;
    if (item?.function?.arguments) current.function.arguments = `${current.function.arguments || ''}${item.function.arguments}`;
    target[index] = current;
  }
  return target;
}

function toToolMessage(toolCallId, content, toolName = '') {
  return {
    role: 'tool',
    tool_call_id: toolCallId,
    content: compactToolResultForModel(toolName, content),
  };
}

function parseToolResult(result) {
  if (!result) return null;
  if (typeof result === 'object') return result;
  if (typeof result !== 'string') return null;
  try {
    return JSON.parse(result);
  } catch {
    return null;
  }
}

function compactToolResultForModel(name, result) {
  const parsed = parseToolResult(result);
  if ((name === 'generate_image' || name === 'video_generate') && parsed && typeof parsed === 'object') {
    if (parsed.type === 'tool_needs_clarification' || parsed.type === 'tool_needs_configuration') {
      return JSON.stringify(parsed);
    }
    const mediaType = name === 'video_generate' ? 'video' : 'image';
    const mediaUrls = Array.isArray(parsed[`${mediaType}s`])
      ? parsed[`${mediaType}s`].filter((u) => typeof u === 'string')
      : Array.isArray(parsed.artifacts)
        ? parsed.artifacts.filter((a) => a?.type === mediaType).map((a) => a.url).filter(Boolean)
        : [];
    const mediaCount = mediaUrls.length;
    const mediaRefs = mediaUrls.map((url, i) => {
      const source = String(url);
      const fileName = source.startsWith('data:')
        ? `inline-${mediaType}-${i + 1}`
        : (source.split('/').pop()?.split('?')[0] || `${mediaType}-${i}`);
      return { ref: fileName, label: `generated-${mediaType}-${i + 1}` };
    });
    return JSON.stringify({
      type: `${mediaType}_generation_result`,
      tool: name,
      status: mediaCount > 0 ? 'completed' : (parsed.status || 'unknown'),
      [`${mediaType}Count`]: mediaCount,
      [`${mediaType}s`]: mediaRefs,
      request: {
        model: cleanString(parsed.request?.model, 200),
        prompt: cleanString(parsed.request?.prompt, 1000),
        ratio: cleanString(parsed.request?.ratio || parsed.request?.aspect_ratio, 40),
        resolution: cleanString(parsed.request?.resolution, 40),
        size: cleanString(parsed.request?.size, 40),
        quality: cleanString(parsed.request?.quality, 40),
        output_format: cleanString(parsed.request?.output_format, 40),
      },
    });
  }

  return typeof result === 'string' ? result : JSON.stringify(result);
}

function buildToolFallbackContent(toolTrace = []) {
  const lastTool = toolTrace[toolTrace.length - 1];
  if (!lastTool) return '';

  const parsed = parseToolResult(lastTool.result);
  if (lastTool.name === 'generate_image') {
    if (parsed?.type === 'tool_needs_clarification') {
      const candidates = Array.isArray(parsed.candidates)
        ? parsed.candidates.map((candidate) => candidate?.model).filter(Boolean)
        : [];
      return candidates.length
        ? `请选择要使用的图像模型：${candidates.join('、')}`
        : '请选择要使用的图像模型。';
    }
    if (parsed?.type === 'tool_needs_configuration') {
      return '当前没有可用的图像模型，请先在设置中配置图像模型。';
    }
    if (Array.isArray(parsed?.images) && parsed.images.length > 0) {
      return '图片已生成。';
    }
  }
  if (lastTool.name === 'video_generate') {
    if (Array.isArray(parsed?.videos) && parsed.videos.length > 0) {
      return '视频已生成。';
    }
    if (parsed?.status === 'submitted') {
      return '视频生成任务已提交。';
    }
  }

  return '';
}

function shouldStopAfterToolResult(name, result) {
  if (!TERMINAL_SIDE_EFFECT_TOOLS.has(name)) return false;
  const parsed = parseToolResult(result);
  if (!parsed || typeof parsed !== 'object') return true;
  if (parsed.type === 'tool_needs_clarification' || parsed.type === 'tool_needs_configuration') return true;
  if (name === 'generate_image') {
    return Array.isArray(parsed.images) || Array.isArray(parsed.artifacts);
  }
  if (name === 'video_generate') {
    return parsed.status === 'submitted'
      || Array.isArray(parsed.videos)
      || Array.isArray(parsed.video)
      || Array.isArray(parsed.artifacts);
  }
  return true;
}

function profileAllowsTool(profile, toolName) {
  return !profile?.enabledTools?.length || profile.enabledTools.includes(toolName);
}

function readTextFromContent(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((part) => {
      if (typeof part === 'string') return part;
      if (part?.type === 'text') return cleanString(part.text, 12000);
      return '';
    })
    .filter(Boolean)
    .join('\n');
}

function readImageUrlsFromContent(content) {
  if (!Array.isArray(content)) return [];
  return content
    .map((part) => {
      if (!part || typeof part !== 'object') return '';
      if (part.type !== 'image_url') return '';
      if (typeof part.image_url === 'string') return part.image_url;
      return typeof part.image_url?.url === 'string' ? part.image_url.url : '';
    })
    .filter(Boolean);
}

function buildCurrentUserText(messages = []) {
  return messages
    .filter((message) => message.role === 'user')
    .map((message) => readTextFromContent(message.content))
    .filter(Boolean)
    .join('\n');
}

function buildCurrentUserImages(messages = []) {
  for (const message of [...messages].reverse()) {
    const images = readImageUrlsFromContent(message.content);
    if (images.length > 0) return images;
  }
  return [];
}

function parseConversationSummarizeResult(result) {
  const parsed = parseToolResult(result);
  if (!parsed || typeof parsed !== 'object') return '';
  return cleanString(parsed.summary, 8000);
}

function compressConversation(conversation, summary) {
  if (!summary) return conversation;
  const SYSTEM_SUMMARY_PREFIX = '[Previous conversation summary]';
  const compressed = [];
  let lastUserIndex = -1;

  for (let i = 0; i < conversation.length; i++) {
    if (conversation[i].role === 'user') {
      lastUserIndex = i;
    }
  }

  for (let i = 0; i < conversation.length; i++) {
    const msg = conversation[i];
    if (msg.role === 'system') {
      compressed.push(msg);
      continue;
    }
    if (i === lastUserIndex) {
      compressed.push({ role: 'system', content: `${SYSTEM_SUMMARY_PREFIX}: ${summary}` });
      compressed.push(msg);
      break;
    }
  }

  return compressed;
}

function throwIfAborted(signal) {
  if (signal?.aborted) {
    throw new Error('Agent session was cancelled');
  }
}

async function consumeStreamingChatResponse(response, handlers = {}) {
  const contentType = response.headers.get('content-type') || '';
  if (!response.body || contentType.includes('application/json')) {
    return extractChatResponse(await response.json());
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let content = '';
  const toolCalls = [];
  let finishReason = 'stop';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);
        if (!data || data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);
          const choice = parsed?.choices?.[0];
          if (!choice) continue;

          if (choice.delta?.content) {
            content += choice.delta.content;
            handlers.onToken?.(choice.delta.content);
          }
          if (Array.isArray(choice.delta?.tool_calls)) {
            mergeToolCalls(toolCalls, choice.delta.tool_calls);
          }
          if (choice.message?.content && typeof choice.message.content === 'string') {
            content = choice.message.content;
          }
          if (Array.isArray(choice.message?.tool_calls)) {
            mergeToolCalls(toolCalls, choice.message.tool_calls);
          }
          if (choice.finish_reason) {
            finishReason = choice.finish_reason;
          }
        } catch {
          // Ignore malformed SSE frames from upstream providers.
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return {
    raw: null,
    content,
    toolCalls,
    finishReason,
    usage: null,
  };
}

export class AgentRuntime {
  constructor({ capabilitiesService, profileService, memoryService, toolRegistry, sessionStore, memoryStrategy }) {
    this.capabilitiesService = capabilitiesService;
    this.profileService = profileService;
    this.memoryService = memoryService;
    this.toolRegistry = toolRegistry;
    this.sessionStore = sessionStore;
    this.memoryStrategy = memoryStrategy || new AgentMemoryStrategy({
      capabilitiesService,
      memoryService,
    });
  }

  buildSystemPrompt(profile, memoryContext) {
    return [profile?.instruction, memoryContext].filter(Boolean).join('\n\n');
  }

  normalizeMessages(messages = []) {
    return messages
      .filter((message) => message && typeof message === 'object')
      .map((message) => {
        const role = cleanString(message.role, 20) || 'user';
        const content = message.content ?? '';
        if (Array.isArray(content)) {
          return {
            role,
            content: content
              .map((part) => {
                if (!part || typeof part !== 'object') return part;
                if (part.type === 'text') return { ...part, text: cleanString(part.text, 12000) };
                return part;
              })
              .filter(Boolean),
          };
        }
        return { role, content: cleanString(content, 12000) };
      });
  }

  createSession({ sessionId, conversationId, profile, resolvedModel, scope }) {
    this.sessionStore.create({
      sessionId,
      conversationId: conversationId || '',
      profileId: profile.id,
      model: resolvedModel,
      toolLoopCount: 0,
      lastRunStatus: 'running',
      status: 'running',
      scope,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  }

  buildRunContext({ conversationId, profileId, model, messages, options = {} }) {
    const sessionId = options.sessionId || randomUUID();
    const profile = this.profileService.resolveProfile(profileId, model);
    const resolvedModel = cleanString(model, 200) || profile.defaultModel || 'gpt-4o-mini';
    const normalizedMessages = this.normalizeMessages(messages);
    const workflowExecutionEnabled = profileAllowsTool(profile, 'workflow_execute');
    const memoryEnabled = this.memoryStrategy.isEnabled?.(profile) !== false && !workflowExecutionEnabled;
    const memoryContext = memoryEnabled
      ? this.memoryService.buildContext(
        normalizedMessages.map((message) => (typeof message.content === 'string' ? message.content : '')).join('\n'),
        5,
        { scope: options.scope },
      )
      : '';
    const allowWebSearch = options.allowWebSearch !== false;
    const tools = this.toolRegistry.toModelTools(profile, { allowWebSearch });
    const conversation = [
      ...(this.buildSystemPrompt(profile, memoryContext) ? [{ role: 'system', content: this.buildSystemPrompt(profile, memoryContext) }] : []),
      ...normalizedMessages,
    ];

    return {
      sessionId,
      profile,
      resolvedModel,
      normalizedMessages,
      allowWebSearch,
      tools,
      conversation,
      currentUserText: buildCurrentUserText(normalizedMessages),
      currentUserImages: buildCurrentUserImages(normalizedMessages),
      maxToolRounds: Number(options.maxToolRounds) || 5,
      maxToolCallsPerRound: Number(options.maxToolCallsPerRound) || 3,
      apiConfig: options.apiConfig || {},
      scope: options.scope,
      conversationId: conversationId || '',
      memoryContextEnabled: memoryEnabled,
    };
  }

  async run({
    conversationId,
    profileId,
    model,
    messages,
    options = {},
    signal,
  }) {
    const runCtx = this.buildRunContext({ conversationId, profileId, model, messages, options });
    const {
      sessionId,
      profile,
      resolvedModel,
      allowWebSearch,
      tools,
      normalizedMessages,
      maxToolRounds,
      maxToolCallsPerRound,
      apiConfig,
      scope,
      conversationId: normalizedConversationId,
      currentUserText,
      currentUserImages,
    } = runCtx;
    let { conversation } = runCtx;
    const toolCalls = [];
    const toolTrace = [];
    this.createSession({ sessionId, conversationId: normalizedConversationId, profile, resolvedModel, scope });

    let lastAssistantMessage = { role: 'assistant', content: '', tool_calls: [] };
    let finalContent = '';
    let round = 0;
    let tokenUsage = buildTokenUsage({ promptMessages: conversation });
    let shouldStopToolLoop = false;

    while (round < maxToolRounds && !shouldStopToolLoop) {
      throwIfAborted(signal);
      round += 1;
      this.sessionStore.update(sessionId, { toolLoopCount: round });
      const promptMessages = conversation.slice();
      const response = await this.capabilitiesService.chat({
        model: resolvedModel,
        messages: conversation,
        tools,
        apiConfig,
        scope,
        signal,
      }, { scope });
      const parsed = extractChatResponse(response);
      const normalizedToolCalls = normalizeToolCalls(parsed.toolCalls);
      lastAssistantMessage = {
        role: 'assistant',
        content: parsed.content,
        tool_calls: normalizedToolCalls.valid,
      };
      tokenUsage = buildTokenUsage({
        promptMessages,
        completionMessage: lastAssistantMessage,
        upstreamUsage: parsed.usage,
      });
      conversation.push(lastAssistantMessage);
      finalContent = parsed.content;

      if (normalizedToolCalls.invalid.length > 0 && normalizedToolCalls.valid.length === 0 && !parsed.content) {
        throw new Error('Agent returned malformed tool calls without a tool name');
      }

      if (normalizedToolCalls.valid.length === 0) {
        break;
      }

      if (normalizedToolCalls.valid.length > maxToolCallsPerRound) {
        throw new Error(`Too many tool calls in one round: ${normalizedToolCalls.valid.length}`);
      }

      for (const toolCall of normalizedToolCalls.valid) {
        throwIfAborted(signal);
        const name = toolCall?.function?.name || '';
        const args = parseToolArguments(toolCall?.function?.arguments);
        const result = await this.toolRegistry.execute(name, args, {
          allowWebSearch,
          profile,
          model: resolvedModel,
          sessionId,
          conversationId: normalizedConversationId,
          conversation,
          apiConfig,
          scope,
          signal,
          currentUserText,
          currentUserImages,
        });
        toolCalls.push({ name, args, result });
        toolTrace.push({ name, args, result });
        conversation.push(toToolMessage(toolCall.id, result, name));
        if (shouldStopAfterToolResult(name, result)) {
          shouldStopToolLoop = true;
          break;
        }
      }

      const summarizeCall = toolCalls.find((tc) => tc.name === 'conversation_summarize');
      if (summarizeCall) {
        const summary = parseConversationSummarizeResult(summarizeCall.result);
        if (summary) {
          conversation = compressConversation(conversation, summary);
        }
      }
    }

    if (!finalContent && toolCalls.length > 0) {
      finalContent = buildToolFallbackContent(toolTrace);
      if (finalContent) {
        lastAssistantMessage = { role: 'assistant', content: finalContent, tool_calls: [] };
      }
    }

    if (!finalContent && toolCalls.length === 0) {
      throw new Error('Agent returned an empty response');
    }

    const memoryWrites = await this.memoryStrategy.writeMemories({
      profile,
      model: resolvedModel,
      messages: normalizedMessages,
      assistantMessage: lastAssistantMessage,
      conversationId: normalizedConversationId,
      apiConfig,
      scope,
      signal,
    });

    const terminalStatus = {
      status: 'completed',
      sessionId,
      conversationId: normalizedConversationId,
      profileId: profile.id,
      model: resolvedModel,
      toolLoopCount: round,
      memoryWriteCount: memoryWrites.length,
      lastRunStatus: 'completed',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      finishedAt: Date.now(),
    };
    this.sessionStore.update(sessionId, terminalStatus);

    return {
      sessionId,
      conversationId: normalizedConversationId,
      profileId: profile.id,
      model: resolvedModel,
      assistantMessage: lastAssistantMessage,
      toolTrace,
      memoryWrites,
      tokenUsage,
      terminalStatus,
    };
  }

  async runStream({
    conversationId,
    profileId,
    model,
    messages,
    options = {},
    signal,
    handlers = {},
  }) {
    const context = this.buildRunContext({ conversationId, profileId, model, messages, options });
    const {
      sessionId,
      profile,
      resolvedModel,
      allowWebSearch,
      tools,
      normalizedMessages,
      maxToolRounds,
      maxToolCallsPerRound,
      apiConfig,
      scope,
      conversationId: normalizedConversationId,
      currentUserText,
      currentUserImages,
    } = context;
    let { conversation } = context;
    const toolTrace = [];
    this.createSession({ sessionId, conversationId: normalizedConversationId, profile, resolvedModel, scope });
    handlers.onSessionStarted?.({
      sessionId,
      conversationId: normalizedConversationId,
      profileId: profile.id,
      model: resolvedModel,
    });

    let lastAssistantMessage = { role: 'assistant', content: '', tool_calls: [] };
    let round = 0;
    let tokenUsage = buildTokenUsage({ promptMessages: conversation });
    let shouldStopToolLoop = false;

    while (round < maxToolRounds && !shouldStopToolLoop) {
      throwIfAborted(signal);
      round += 1;
      this.sessionStore.update(sessionId, { toolLoopCount: round });
      const promptMessages = conversation.slice();
      const parsed = await consumeStreamingChatResponse(
        await this.capabilitiesService.chatStream({
          model: resolvedModel,
          messages: conversation,
          tools,
          apiConfig,
          scope,
          signal,
        }, { scope }),
        {
          onToken: (delta) => handlers.onMessageDelta?.({ sessionId, delta }),
        },
      );

      const normalizedToolCalls = normalizeToolCalls(parsed.toolCalls);
      lastAssistantMessage = {
        role: 'assistant',
        content: parsed.content,
        tool_calls: normalizedToolCalls.valid,
      };
      tokenUsage = buildTokenUsage({
        promptMessages,
        completionMessage: lastAssistantMessage,
        upstreamUsage: parsed.usage,
      });
      conversation.push(lastAssistantMessage);

      if (normalizedToolCalls.invalid.length > 0 && normalizedToolCalls.valid.length === 0 && !parsed.content) {
        throw new Error('Agent returned malformed tool calls without a tool name');
      }

      if (normalizedToolCalls.valid.length === 0) {
        break;
      }

      if (normalizedToolCalls.valid.length > maxToolCallsPerRound) {
        throw new Error(`Too many tool calls in one round: ${normalizedToolCalls.valid.length}`);
      }

      for (const toolCall of normalizedToolCalls.valid) {
        throwIfAborted(signal);
        const name = toolCall?.function?.name || '';
        const args = parseToolArguments(toolCall?.function?.arguments);
        handlers.onToolCallStarted?.({ sessionId, name, args });
        const result = await this.toolRegistry.execute(name, args, {
          allowWebSearch,
          profile,
          model: resolvedModel,
          sessionId,
          conversationId: normalizedConversationId,
          conversation,
          apiConfig,
          scope,
          signal,
          currentUserText,
          currentUserImages,
          onWorkflowRunStarted: (payload) => handlers.onWorkflowRunStarted?.({ sessionId, toolName: name, ...payload }),
        });
        toolTrace.push({ name, args, result });
        handlers.onToolCallCompleted?.({ sessionId, name, args, result });
        conversation.push(toToolMessage(toolCall.id, result, name));
        if (shouldStopAfterToolResult(name, result)) {
          shouldStopToolLoop = true;
          break;
        }
      }

      const summarizeCall = toolTrace.find((tc) => tc.name === 'conversation_summarize');
      if (summarizeCall) {
        const summary = parseConversationSummarizeResult(summarizeCall.result);
        if (summary) {
          conversation = compressConversation(conversation, summary);
        }
      }
    }

    if (!lastAssistantMessage.content && toolTrace.length > 0) {
      const fallbackContent = buildToolFallbackContent(toolTrace);
      if (fallbackContent) {
        lastAssistantMessage = { role: 'assistant', content: fallbackContent, tool_calls: [] };
      }
    }

    if (!lastAssistantMessage.content && (!lastAssistantMessage.tool_calls || lastAssistantMessage.tool_calls.length === 0)) {
      throw new Error('Agent returned an empty response');
    }

    const memoryWrites = await this.memoryStrategy.writeMemories({
      profile,
      model: resolvedModel,
      messages: normalizedMessages,
      assistantMessage: lastAssistantMessage,
      conversationId: normalizedConversationId,
      apiConfig,
      scope,
      signal,
    });

    const terminalStatus = {
      status: 'completed',
      sessionId,
      conversationId: normalizedConversationId,
      profileId: profile.id,
      model: resolvedModel,
      toolLoopCount: round,
      memoryWriteCount: memoryWrites.length,
      lastRunStatus: 'completed',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      finishedAt: Date.now(),
    };
    this.sessionStore.update(sessionId, terminalStatus);

    const result = {
      sessionId,
      conversationId: normalizedConversationId,
      profileId: profile.id,
      model: resolvedModel,
      assistantMessage: lastAssistantMessage,
      toolTrace,
      memoryWrites,
      tokenUsage,
      terminalStatus,
    };
    handlers.onMessageCompleted?.(result);
    return result;
  }
}
