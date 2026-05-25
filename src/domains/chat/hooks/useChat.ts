import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AgentRole, ApiConfig, BridgeRef, ChatMsg, Conv, ModelInfo, ToolCallState } from '@/shared/types';
import type { ProviderConfig } from '@/shared/providers';
import { createProvider } from '@/shared/providers';
import { debouncedSaveJSON, gid, loadJSON } from '@/shared/runtime';
import { cancelAgentSession, sendAgentChat, sendAgentChatStream, type AgentChatResult } from '@/shared/api/agent';
import { deleteConversation, loadConversations, saveConversations, saveImage, saveVideo } from '@/shared/api/assistant';
import { capabilityWebSearch, isBackendAvailable } from '@/shared/api';
import { uploadFile } from '@/shared/api/files';
import { cancelExecution } from '@/domains/workflow/lib/api';
import { buildApiConfigPayload, resolveModelConfig, resolveProviderModelId, resolveSelectedModel } from '@/shared/providers/model-routing';
import { buildTools } from '../constants';

type PendingFile = {
  id: string;
  name: string;
  type: string;
  content: string;
};

type AgentTokenUsage = NonNullable<AgentChatResult['tokenUsage']>;

type UseChatResult = {
  convs: Conv[];
  activeId: string;
  conv: Conv;
  input: string;
  setInput: (value: string) => void;
  sendings: Set<string>;
  pendingImages: string[];
  pendingFiles: PendingFile[];
  tokenUsage?: AgentTokenUsage;
  previewUrl: string | null;
  setPreviewUrl: (value: string | null) => void;
  webSearchEnabled: boolean;
  setWebSearchEnabled: (value: boolean) => void;
  canUseWebSearch: boolean;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  chatModels: ModelInfo[];
  currentModel: string;
  currentModelDisabledReason: string;
  currentRole: AgentRole;
  canSend: boolean;
  setActiveId: (id: string) => void;
  setConvModel: (model: string, id?: string) => void;
  setRole: (roleId: string) => void;
  newConv: () => void;
  delConv: (id: string) => void;
  deleteMessage: (id: string) => void;
  regenerate: (id?: unknown) => void;
  cancel: (id: string) => void;
  send: () => Promise<void>;
  handleFileUpload: (files: FileList | File[]) => void;
  addPendingImages: (urls: string[]) => void;
  removePendingImage: (target: string | number) => void;
  removePendingFile: (id: string) => void;
};

const STORAGE_KEY = 'chat_convs';
const ACTIVE_KEY = 'chat_active';
const WEB_SEARCH_KEY = 'chat_web_search_enabled';

function createConversation(model: string, roleId?: string): Conv {
  return { id: gid(), title: 'New Chat', model, roleId, msgs: [], ts: Date.now() };
}

function getDefaultChatModel(models: ModelInfo[]) {
  return models.find((model) => model.cat === 'chat')?.id || '';
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function fileToText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

function canReadAsText(file: File) {
  const lowerName = file.name.toLowerCase();
  return file.type.startsWith('text/') || /\.(md|markdown|txt|csv|json|xml|html|css|js|jsx|ts|tsx|py|java|go|rs|c|cpp|h|hpp|yaml|yml|toml|ini|log)$/i.test(lowerName);
}

function parseToolArguments(raw: string | undefined) {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function mergeServerConversations(serverConvs: Conv[], localConvs: Conv[], fallbackModel: string, fallbackRoleId?: string) {
  if (serverConvs.length > 0) return serverConvs;
  if (localConvs.length > 0) return localConvs;
  return [createConversation(fallbackModel, fallbackRoleId)];
}

function buildBackendMessages(messages: ChatMsg[]) {
  return messages.map((msg) => {
    const images = msg.role === 'user' ? msg.images : [];
    if (images.length === 0) {
      return { role: msg.role, content: msg.content };
    }
    return {
      role: msg.role,
      content: [
        { type: 'text' as const, text: msg.content || 'Please analyze these images.' },
        ...images.map((image) => ({ type: 'image_url' as const, image_url: { url: image } })),
      ],
    };
  });
}

function readAssistantContent(payload: AgentChatResult | null | undefined) {
  return payload?.assistantMessage?.content || '';
}

function parseJsonIfPossible(value: unknown) {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function getToolResultArtifacts(result: Record<string, unknown> | null): ToolCallState['artifacts'] | undefined {
  if (!result) return undefined;
  if (Array.isArray(result.artifacts)) return result.artifacts as ToolCallState['artifacts'];
  if (Array.isArray(result.images)) {
    return result.images
      .filter((image): image is string => typeof image === 'string' && image.length > 0)
      .map((url, index) => ({
        type: 'image' as const,
        url,
        name: `generated-image-${index + 1}`,
      }));
  }
  return undefined;
}

function getToolResultPrompt(result: Record<string, unknown> | null) {
  const request = result?.request;
  if (!request || typeof request !== 'object') return '';
  return typeof (request as Record<string, unknown>).prompt === 'string'
    ? String((request as Record<string, unknown>).prompt)
    : '';
}

function getToolResultModel(result: Record<string, unknown> | null, fallback: string) {
  const request = result?.request;
  if (!request || typeof request !== 'object') return fallback;
  return typeof (request as Record<string, unknown>).model === 'string'
    ? String((request as Record<string, unknown>).model)
    : fallback;
}

function buildToolLabel(name: string, status: ToolCallState['status'], workflowName?: string) {
  if (name === 'workflow_execute') {
    if (status === 'processing') return `工作流执行中${workflowName ? ` · ${workflowName}` : ''}`;
    if (status === 'done') return `工作流已完成${workflowName ? ` · ${workflowName}` : ''}`;
    if (status === 'cancelled') return `工作流已取消${workflowName ? ` · ${workflowName}` : ''}`;
    return `工作流执行失败${workflowName ? ` · ${workflowName}` : ''}`;
  }
  if (status === 'processing') return `工具执行中 · ${name}`;
  if (status === 'done') return `工具已完成 · ${name}`;
  if (status === 'cancelled') return `工具已取消 · ${name}`;
  return `工具执行失败 · ${name}`;
}

function buildToolStartDetail(name: string, args: Record<string, unknown>): string | undefined {
  switch (name) {
    case 'generate_image': {
      const prompt = typeof args.prompt === 'string' ? args.prompt : '';
      const n = typeof args.n === 'number' ? args.n : 1;
      return prompt ? `生成 ${n} 张图片 · "${prompt.slice(0, 50)}${prompt.length > 50 ? '...' : ''}"` : `生成 ${n} 张图片`;
    }
    case 'video_generate': {
      const prompt = typeof args.prompt === 'string' ? args.prompt : '';
      return prompt ? `生成视频 · "${prompt.slice(0, 50)}${prompt.length > 50 ? '...' : ''}"` : '正在生成视频';
    }
    case 'web_search': {
      const query = typeof args.query === 'string' ? args.query : '';
      return query ? `搜索 "${query.slice(0, 50)}${query.length > 50 ? '...' : ''}"` : '正在搜索';
    }
    case 'search_memory': {
      const query = typeof args.query === 'string' ? args.query : '';
      return query ? `检索记忆 "${query.slice(0, 50)}${query.length > 50 ? '...' : ''}"` : '正在检索记忆';
    }
    case 'conversation_summarize':
      return '正在生成对话摘要...';
    case 'workflow_execute': {
      const workflowName = typeof args.workflowName === 'string' ? args.workflowName : '';
      return workflowName ? `执行工作流 · ${workflowName}` : '正在执行工作流';
    }
    case 'get_current_time':
      return '正在获取当前时间...';
    default:
      return undefined;
  }
}

function buildToolDetail(name: string, result: Record<string, unknown> | null): string | undefined {
  if (!result) return undefined;
  switch (name) {
    case 'web_search':
      return `查询: ${result.query || '?'} · ${result.resultCount ?? 0} 条结果`;
    case 'search_memory':
      return `查询: ${result.query || '?'} · ${result.resultCount ?? 0} 条记忆`;
    case 'get_current_time':
      return `${result.local || result.iso || '?'} (${result.timezone || '?'})`;
    case 'conversation_summarize':
      return `已压缩 ${result.originalMessageCount ?? 0} 条消息 → ${typeof result.summary === 'string' ? result.summary.length : 0} 字符摘要`;
    case 'generate_image':
      return typeof result.status === 'string' ? `状态: ${result.status} · ${result.imageCount ?? 0} 张图片` : undefined;
    case 'video_generate':
      return typeof result.status === 'string' ? `状态: ${result.status} · ${Array.isArray(result.artifacts) ? result.artifacts.length : 0} 个视频` : undefined;
    case 'workflow_execute':
      return typeof result.summary === 'string' ? result.summary : undefined;
    default:
      return undefined;
  }
}

function updateAssistantToolCallState(
  conversationId: string,
  assistantId: string,
  updateConversation: (id: string, updater: (conv: Conv) => Conv) => void,
  patch: Partial<ToolCallState> & { name?: string; type?: ToolCallState['type']; status?: ToolCallState['status'] },
) {
  updateConversation(conversationId, (item) => ({
    ...item,
    msgs: item.msgs.map((msg) => {
      if (msg.id !== assistantId) return msg;
      const currentToolCall = msg.toolCall;
      const keepCompletedImageTool = currentToolCall?.type === 'image'
        && currentToolCall.status === 'done'
        && patch.status === 'failed'
        && !patch.name;
      const nextStatus = keepCompletedImageTool
        ? currentToolCall.status
        : patch.status || currentToolCall?.status || 'processing';
      const nextName = patch.name || msg.toolCall?.name || '';
      const nextWorkflowName = patch.workflowName || msg.toolCall?.workflowName;
      const nextType = patch.type || msg.toolCall?.type || (nextName === 'workflow_execute' ? 'workflow' : nextName === 'video_generate' ? 'video' : 'tool');
      return {
        ...msg,
        toolCall: {
          ...msg.toolCall,
          ...patch,
          type: nextType,
          name: nextName,
          status: nextStatus,
          error: keepCompletedImageTool ? currentToolCall?.error : patch.error ?? currentToolCall?.error,
          label: keepCompletedImageTool
            ? msg.toolCall?.label || buildToolLabel(nextName, nextStatus, nextWorkflowName)
            : patch.label || buildToolLabel(nextName, nextStatus, nextWorkflowName),
        },
      };
    }),
  }));
}

export function useChat(
  base: string,
  apiKey: string,
  apiConfigs: ApiConfig[],
  models: ModelInfo[],
  addLog: (level: string, message: string) => void,
  bridgeRef: React.MutableRefObject<BridgeRef>,
  roles: AgentRole[],
  getMemoryContext: () => string,
  refreshMemories: () => Promise<void>,
  scheduleExtraction: (msgs: { role: string; content: string }[], cid: string, model: string, base: string, key: string) => void,
  tavilyApiKey: string,
  providerConfig?: ProviderConfig,
  _chatStreamingMode?: 'stream' | 'non-stream',
  _videoStreamingMode?: 'stream' | 'non-stream',
  _activeTab?: string,
  searchMemories?: (query: string) => string,
): UseChatResult {
  const chatModels = useMemo(() => models.filter((model) => model.cat === 'chat'), [models]);
  const defaultModel = getDefaultChatModel(models);
  const [convs, setConvs] = useState<Conv[]>(() => {
    const saved = loadJSON<Conv[]>(STORAGE_KEY, []);
    return saved.length > 0 ? saved : [createConversation(defaultModel, roles[0]?.id)];
  });
  const [activeId, setActiveIdState] = useState(() => loadJSON<string>(ACTIVE_KEY, ''));
  const [input, setInput] = useState('');
  const [sendings, setSendings] = useState<Set<string>>(new Set());
  const [pendingImages, setPendingImages] = useState<string[]>([]);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [tokenUsageByConversation, setTokenUsageByConversation] = useState<Record<string, AgentTokenUsage>>({});
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [webSearchEnabled, setWebSearchEnabled] = useState(() => loadJSON<boolean>(WEB_SEARCH_KEY, false));
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const abortControllers = useRef<Record<string, AbortController>>({});
  const backendSessionIds = useRef<Record<string, string>>({});
  const backendConversationsLoadedRef = useRef(false);
  const backendAvailable = isBackendAvailable();
  const useAgentStreaming = backendAvailable;

  const activeIdResolved = activeId && convs.some((conv) => conv.id === activeId) ? activeId : convs[0]?.id || '';
  const conv = convs.find((item) => item.id === activeIdResolved) || convs[0] || createConversation(defaultModel, roles[0]?.id);
  const savedModelIsChat = chatModels.some((model) => model.id === conv.model || model.modelId === conv.model);
  const currentModel = savedModelIsChat ? conv.model : defaultModel;
  const currentModelInfo = resolveSelectedModel(chatModels, currentModel);
  const providerModel = resolveProviderModelId(chatModels, currentModel);
  const currentModelConfig = resolveModelConfig(apiConfigs, currentModelInfo);
  const currentRole = roles.find((role) => role.id === conv.roleId) || roles[0] || { id: 'default', name: 'Default', icon: 'bot', systemPrompt: '', tools: [] };
  const currentModelDisabledReason = currentModel ? '' : 'Please configure a chat model in settings first.';
  const canUseWebSearch = Boolean(tavilyApiKey);
  const canSend = Boolean((input.trim() || pendingImages.length > 0 || pendingFiles.length > 0) && currentModel && !sendings.has(conv.id));

  useEffect(() => {
    if (!activeIdResolved && convs.length > 0) setActiveIdState(convs[0].id);
  }, [activeIdResolved, convs]);

  useEffect(() => {
    if (backendAvailable) {
      if (!backendConversationsLoadedRef.current) return;
      void saveConversations(convs);
      return;
    }
    debouncedSaveJSON(STORAGE_KEY, convs);
  }, [backendAvailable, convs]);

  useEffect(() => {
    debouncedSaveJSON(ACTIVE_KEY, activeIdResolved);
  }, [activeIdResolved]);

  useEffect(() => {
    debouncedSaveJSON(WEB_SEARCH_KEY, webSearchEnabled);
  }, [webSearchEnabled]);

  useEffect(() => {
    if (!backendAvailable) {
      backendConversationsLoadedRef.current = false;
      return;
    }

    if (backendConversationsLoadedRef.current) {
      return;
    }

    void loadConversations()
      .then((serverConvs) => {
        setConvs((current) => mergeServerConversations(serverConvs, current, defaultModel, roles[0]?.id));
        backendConversationsLoadedRef.current = true;
      });
  }, [backendAvailable, defaultModel, roles]);

  const setActiveId = useCallback((id: string) => setActiveIdState(id), []);

  const updateConversation = useCallback((id: string, updater: (conv: Conv) => Conv) => {
    setConvs((prev) => prev.map((item) => (item.id === id ? updater(item) : item)));
  }, []);

  const newConv = useCallback(() => {
    const next = createConversation(defaultModel, roles[0]?.id);
    setConvs((prev) => [next, ...prev]);
    setActiveIdState(next.id);
  }, [defaultModel, roles]);

  const delConv = useCallback((id: string) => {
    setConvs((prev) => {
      const next = prev.filter((item) => item.id !== id);
      if (activeIdResolved === id) setActiveIdState(next[0]?.id || '');
      return next.length > 0 ? next : [createConversation(defaultModel, roles[0]?.id)];
    });
    if (isBackendAvailable()) void deleteConversation(id);
  }, [activeIdResolved, defaultModel, roles]);

  const setConvModel = useCallback((model: string, id = activeIdResolved) => {
    if (!chatModels.some((item) => item.id === model || item.modelId === model)) return;
    updateConversation(id, (item) => ({ ...item, model }));
  }, [activeIdResolved, chatModels, updateConversation]);

  const setRole = useCallback((roleId: string) => {
    updateConversation(activeIdResolved, (item) => ({ ...item, roleId }));
  }, [activeIdResolved, updateConversation]);

  const deleteMessage = useCallback((id: string) => {
    updateConversation(activeIdResolved, (item) => ({ ...item, msgs: item.msgs.filter((msg) => msg.id !== id) }));
  }, [activeIdResolved, updateConversation]);

  const cancel = useCallback((id: string) => {
    abortControllers.current[id]?.abort();
    const sessionId = backendSessionIds.current[id];
    const targetConversation = convs.find((item) => item.id === id);
    const activeWorkflowRunId = [...(targetConversation?.msgs || [])]
      .reverse()
      .find((msg) => msg.role === 'assistant' && msg.toolCall?.type === 'workflow' && msg.toolCall.runId)?.toolCall?.runId;

    if (sessionId && isBackendAvailable()) {
      void cancelAgentSession(sessionId).catch(() => {});
      delete backendSessionIds.current[id];
    }
    if (activeWorkflowRunId) {
      void cancelExecution(activeWorkflowRunId).catch(() => {});
    }
    delete abortControllers.current[id];
    setSendings((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, [convs]);

  const addPendingImages = useCallback((urls: string[]) => {
    setPendingImages((prev) => Array.from(new Set([...prev, ...urls])));
  }, []);

  useEffect(() => {
    bridgeRef.current.addToChatPending = addPendingImages;
  }, [addPendingImages, bridgeRef]);

  const removePendingImage = useCallback((target: string | number) => {
    setPendingImages((prev) => typeof target === 'number' ? prev.filter((_, index) => index !== target) : prev.filter((item) => item !== target));
  }, []);

  const removePendingFile = useCallback((id: string) => {
    setPendingFiles((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const persistToolArtifacts = useCallback(async (
    toolName: string,
    resultObj: Record<string, unknown> | null,
    artifacts: ToolCallState['artifacts'] | undefined,
  ): Promise<ToolCallState['artifacts'] | undefined> => {
    if (!artifacts || artifacts.length === 0) return artifacts;

    const prompt = getToolResultPrompt(resultObj);
    const artifactModel = getToolResultModel(resultObj, currentModel);

    if (toolName === 'generate_image') {
      type ImageArtifact = NonNullable<ToolCallState['artifacts']>[number] & { thumbnailUrl?: string };
      const persistedItems: Array<NonNullable<ToolCallState['artifacts']>[number] | ImageArtifact> = await Promise.all(artifacts.map(async (artifact, index) => {
        if (artifact.type !== 'image' || !artifact.url) return artifact;
        const ts = Date.now() + index;
        const id = gid();
          const persisted = await saveImage(
            artifact.url.startsWith('data:image/')
              ? { id, data: artifact.url, prompt, model: artifactModel, ts }
              : { id, url: artifact.url, prompt, model: artifactModel, ts },
          );
          return {
            ...artifact,
            url: persisted.localUrl || artifact.url,
            thumbnailUrl: persisted.thumbnailUrl || ('thumbnailUrl' in artifact ? artifact.thumbnailUrl : undefined),
          };
        }));

      const galleryItems = persistedItems
        .filter((artifact): artifact is ImageArtifact => Boolean(artifact && artifact.type === 'image' && artifact.url))
        .map((artifact, index) => ({
          id: `${Date.now()}_${index}`,
          url: artifact.url,
          thumbnailUrl: artifact.thumbnailUrl,
          prompt,
          model: artifactModel,
          ts: Date.now() + index,
        }));
      if (galleryItems.length > 0) {
        bridgeRef.current.addToImageGallery(galleryItems);
      }
      return persistedItems;
    }

    if (toolName === 'video_generate') {
      const persistedItems = await Promise.all(artifacts.map(async (artifact, index) => {
        if (artifact.type !== 'video' || !artifact.url) return artifact;
        const ts = Date.now() + index;
        const id = gid();
        const localUrl = await saveVideo({ id, url: artifact.url, prompt, model: artifactModel, ts });
        const nextUrl = localUrl || artifact.url;
        bridgeRef.current.addToVideoGallery({ id, url: nextUrl, prompt, model: artifactModel, ts });
        return { ...artifact, url: nextUrl };
      }));
      return persistedItems;
    }

    return artifacts;
  }, [bridgeRef, currentModel]);

  const handleFileUpload = useCallback((files: FileList | File[]) => {
    const items = Array.from(files);
    const imageFiles = items.filter((file) => file.type.startsWith('image/'));
    const textFiles = items.filter((file) => !file.type.startsWith('image/') && canReadAsText(file) && file.size <= 1024 * 1024);
    const skippedFiles = items.filter((file) => !file.type.startsWith('image/') && (!canReadAsText(file) || file.size > 1024 * 1024));

    if (imageFiles.length > 0) {
      void Promise.all(imageFiles.map(async (file) => {
        if (!isBackendAvailable()) return fileToDataUrl(file);
        const uploaded = await uploadFile(file);
        return uploaded.url;
      }))
        .then(addPendingImages)
        .catch((error) => addLog('error', `Image upload failed: ${error instanceof Error ? error.message : String(error)}`));
    }

    if (textFiles.length > 0) {
      void Promise.all(textFiles.map(async (file) => ({
        id: gid(),
        name: file.name,
        type: file.type || 'text/plain',
        content: await fileToText(file),
      })))
        .then((nextFiles) => setPendingFiles((prev) => [...prev, ...nextFiles]))
        .catch((error) => addLog('error', `File read failed: ${error instanceof Error ? error.message : String(error)}`));
    }

    if (skippedFiles.length > 0) {
      addLog('warn', `These files are not supported for direct reading: ${skippedFiles.map((file) => file.name).join(', ')}`);
    }
  }, [addLog, addPendingImages]);

  const runToolCall = useCallback(async (toolCall: { id?: string; function?: { name?: string; arguments?: string } }) => {
    const name = toolCall.function?.name || '';
    const args = parseToolArguments(toolCall.function?.arguments);

    if (name === 'web_search') {
      if (!tavilyApiKey) return 'Tavily API key is not configured.';
      const query = String(args.query || '').trim();
      if (!query) return 'Missing search query.';
      const data = await capabilityWebSearch({ query, maxResults: 5, includeAnswer: true, apiConfig: { tavilyApiKey } });
      return data.content || JSON.stringify(data.raw ?? {});
    }

    if (name === 'search_memory') {
      const query = String(args.query || '').trim();
      return searchMemories?.(query) || 'No related memory found.';
    }

    if (name === 'get_current_time') {
      const timezone = String(args.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai');
      return new Date().toLocaleString('zh-CN', { timeZone: timezone });
    }

    if (name === 'summarize_conversation') {
      return conv.msgs.map((msg) => `${msg.role}: ${msg.content}`).join('\n').slice(-6000);
    }

    return `Tool ${name || 'unknown'} is not available in the local chat fallback.`;
  }, [conv.msgs, searchMemories, tavilyApiKey]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!canSend || !activeIdResolved || !currentModel) return;

    const fileContext = pendingFiles.map((file) => `\n\n[Attachment: ${file.name}]\n${file.content}`).join('');
    const userContent = `${text}${fileContext}`;
    const userMessage: ChatMsg = { id: gid(), role: 'user', content: userContent, images: pendingImages, ts: Date.now() };
    const assistantId = gid();
    const assistantMessage: ChatMsg = { id: assistantId, role: 'assistant', content: '', images: [], ts: Date.now() };
    const controller = new AbortController();

    abortControllers.current[activeIdResolved] = controller;
    setInput('');
    setPendingImages([]);
    setPendingFiles([]);
    setSendings((prev) => new Set(prev).add(activeIdResolved));
    updateConversation(activeIdResolved, (item) => ({
      ...item,
      model: currentModel,
      title: item.msgs.length === 0 ? (text || pendingFiles[0]?.name || 'Image Message').slice(0, 30) : item.title,
      msgs: [...item.msgs, userMessage, assistantMessage],
      ts: Date.now(),
    }));

    let finalContent = '';

    try {
      const sourceMessages = buildBackendMessages([...conv.msgs, userMessage]);

      if (isBackendAvailable()) {
        const requestPayload = {
          conversationId: activeIdResolved,
          profileId: currentRole.id,
          model: providerModel,
          messages: sourceMessages,
          attachments: pendingFiles.map((file) => ({
            id: file.id,
            name: file.name,
            type: file.type,
          })),
          options: {
            stream: useAgentStreaming,
            allowWebSearch: webSearchEnabled && Boolean(tavilyApiKey),
          },
          apiConfig: buildApiConfigPayload(currentModelConfig, { apiKey, baseUrl: base, providerConfig }),
          signal: controller.signal,
        };

        if (useAgentStreaming) {
          const response = await sendAgentChatStream(requestPayload);
          const reader = response.body?.getReader();
          if (!reader) {
            throw new Error('Streaming response body is unavailable.');
          }

          const decoder = new TextDecoder('utf-8');
          let buffer = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const events = buffer.split('\n\n');
            buffer = events.pop() || '';

            for (const eventBlock of events) {
              const lines = eventBlock.split('\n').map((line) => line.trim()).filter(Boolean);
              const eventName = lines.find((line) => line.startsWith('event: '))?.slice(7) || 'message';
              const dataLine = lines.find((line) => line.startsWith('data: '));
              if (!dataLine) continue;

              const payload = JSON.parse(dataLine.slice(6));
              if (eventName === 'agent_session_started' && payload.sessionId) {
                backendSessionIds.current[activeIdResolved] = payload.sessionId;
                if (payload.agentRunLog?.path) {
                  addLog('info', `Agent run log: ${payload.agentRunLog.path}`);
                }
              }
              if (eventName === 'agent_tool_call_started') {
                const toolName = typeof payload.name === 'string' ? payload.name : 'tool';
                const args = payload.args && typeof payload.args === 'object' ? payload.args as Record<string, unknown> : {};
                updateAssistantToolCallState(activeIdResolved, assistantId, updateConversation, {
                  type: toolName === 'workflow_execute' ? 'workflow' : toolName === 'video_generate' ? 'video' : 'tool',
                  name: toolName,
                  status: 'processing',
                  detail: buildToolStartDetail(toolName, args),
                });
              }
              if (eventName === 'agent_workflow_run_started') {
                updateAssistantToolCallState(activeIdResolved, assistantId, updateConversation, {
                  type: 'workflow',
                  name: typeof payload.toolName === 'string' ? payload.toolName : 'workflow_execute',
                  status: 'processing',
                  runId: typeof payload.runId === 'string' ? payload.runId : undefined,
                  workflowId: typeof payload.workflowId === 'string' ? payload.workflowId : undefined,
                  workflowName: typeof payload.workflowName === 'string' ? payload.workflowName : undefined,
                  source: payload.source === 'draft' ? 'draft' : payload.source === 'persisted' ? 'persisted' : undefined,
                  detail: typeof payload.source === 'string'
                    ? `runId: ${payload.runId || '-'} · source: ${payload.source}`
                    : (typeof payload.runId === 'string' ? `runId: ${payload.runId}` : undefined),
                });
              }
              if (eventName === 'agent_message_delta' && typeof payload.delta === 'string') {
                finalContent += payload.delta;
                updateConversation(activeIdResolved, (item) => ({
                  ...item,
                  msgs: item.msgs.map((msg) => (msg.id === assistantId ? { ...msg, content: finalContent } : msg)),
                }));
              }
              if (eventName === 'agent_tool_call_completed') {
                const toolName = typeof payload.name === 'string' ? payload.name : 'tool';
                const parsedResult = parseJsonIfPossible(payload.result) as Record<string, unknown> | string | undefined;
                const workflowResult = parsedResult && typeof parsedResult === 'object' ? parsedResult : null;
                const artifacts = await persistToolArtifacts(toolName, workflowResult, getToolResultArtifacts(workflowResult));
                const status = workflowResult?.status === 'cancelled'
                  ? 'cancelled'
                  : workflowResult?.status === 'failed'
                    ? 'failed'
                    : 'done';
                const toolDetail = buildToolDetail(toolName, workflowResult);
                updateAssistantToolCallState(activeIdResolved, assistantId, updateConversation, {
                  type: toolName === 'workflow_execute' ? 'workflow' : toolName === 'generate_image' ? 'image' : toolName === 'video_generate' ? 'video' : 'tool',
                  name: toolName,
                  status,
                  runId: typeof workflowResult?.runId === 'string' ? workflowResult.runId : undefined,
                  workflowId: typeof workflowResult?.workflowId === 'string' ? workflowResult.workflowId : undefined,
                  workflowName: typeof workflowResult?.workflowName === 'string' ? workflowResult.workflowName : undefined,
                  source: workflowResult?.source === 'draft' ? 'draft' : workflowResult?.source === 'persisted' ? 'persisted' : undefined,
                  artifacts,
                  detail: toolDetail,
                  error: typeof workflowResult?.error === 'string' ? workflowResult.error : undefined,
                });
              }
              if (eventName === 'agent_message_completed') {
                const result = payload as AgentChatResult;
                backendSessionIds.current[activeIdResolved] = result.sessionId;
                finalContent = readAssistantContent(result) || finalContent;
                if (result.tokenUsage) {
                  setTokenUsageByConversation((prev) => ({ ...prev, [activeIdResolved]: result.tokenUsage as AgentTokenUsage }));
                }
                if (result.memoryWrites?.length) {
                  void refreshMemories();
                }
              }
              if (eventName === 'agent_session_failed') {
                updateAssistantToolCallState(activeIdResolved, assistantId, updateConversation, {
                  status: controller.signal.aborted ? 'cancelled' : 'failed',
                  error: payload.message || 'Agent stream failed.',
                });
                throw new Error(payload.message || 'Agent stream failed.');
              }
            }
          }
        } else {
          const agentResult = await sendAgentChat(requestPayload);
          backendSessionIds.current[activeIdResolved] = agentResult.sessionId;
          if (agentResult.agentRunLog?.path) {
            addLog('info', `Agent run log: ${agentResult.agentRunLog.path}`);
          }
          finalContent = readAssistantContent(agentResult);
          for (const trace of agentResult.toolTrace) {
            const parsedResult = parseJsonIfPossible(trace.result) as Record<string, unknown> | string | undefined;
            const resultObj = parsedResult && typeof parsedResult === 'object' ? parsedResult : null;
            if (!resultObj) continue;
            const artifacts = await persistToolArtifacts(trace.name, resultObj, getToolResultArtifacts(resultObj));
            const toolDetail = buildToolDetail(trace.name, resultObj);
            updateAssistantToolCallState(activeIdResolved, assistantId, updateConversation, {
              type: trace.name === 'workflow_execute' ? 'workflow' : trace.name === 'generate_image' ? 'image' : trace.name === 'video_generate' ? 'video' : 'tool',
              name: trace.name,
              status: resultObj.status === 'cancelled' ? 'cancelled' : resultObj.status === 'failed' ? 'failed' : 'done',
              runId: typeof resultObj.runId === 'string' ? resultObj.runId : undefined,
              workflowId: typeof resultObj.workflowId === 'string' ? resultObj.workflowId : undefined,
              workflowName: typeof resultObj.workflowName === 'string' ? resultObj.workflowName : undefined,
              source: resultObj.source === 'draft' ? 'draft' : resultObj.source === 'persisted' ? 'persisted' : undefined,
              artifacts,
              detail: toolDetail,
              error: typeof resultObj.error === 'string' ? resultObj.error : undefined,
            });
          }
          if (agentResult.memoryWrites?.length) {
            void refreshMemories();
          }
          if (agentResult.tokenUsage) {
            setTokenUsageByConversation((prev) => ({ ...prev, [activeIdResolved]: agentResult.tokenUsage as AgentTokenUsage }));
          }
        }
      } else {
        const memoryContext = getMemoryContext();
        const searchPrompt = webSearchEnabled && tavilyApiKey
          ? 'Web search is enabled for this turn. If the task involves current facts, news, prices, versions, docs, or time-sensitive information, call web_search first and then answer from the results.'
          : '';
        const systemPrompt = [currentRole.systemPrompt, memoryContext, searchPrompt].filter(Boolean).join('\n\n');
        const tools = buildTools(false, false, webSearchEnabled && Boolean(tavilyApiKey));
        const provider = createProvider(currentModelConfig?.base || base, currentModelConfig?.apiKey || apiKey, currentModelConfig?.providerConfig || providerConfig);
        const result = await provider.chatCompletion({
          model: providerModel,
          messages: [
            ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
            ...sourceMessages,
          ],
          tools,
          signal: controller.signal,
        });

        finalContent = result.content;

        if (result.toolCalls && result.toolCalls.length > 0) {
          const toolMessages = await Promise.all(result.toolCalls.map(async (toolCall) => ({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: await runToolCall(toolCall),
          })));
          const toolResult = await provider.chatCompletion({
            model: providerModel,
            messages: [
              ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
              ...sourceMessages,
              { role: 'assistant', content: result.content || '', tool_calls: result.toolCalls },
              ...toolMessages,
            ],
            signal: controller.signal,
          });
          finalContent = toolResult.content || result.content;
        }
      }

      updateConversation(activeIdResolved, (item) => ({
        ...item,
        msgs: item.msgs.map((msg) => (msg.id === assistantId ? { ...msg, content: finalContent } : msg)),
      }));

      if (!isBackendAvailable()) {
        const extractionMessages = [...conv.msgs, userMessage]
          .map((msg) => ({ role: msg.role, content: msg.content }))
          .concat({ role: 'assistant', content: finalContent });
        scheduleExtraction(extractionMessages, activeIdResolved, providerModel, currentModelConfig?.base || base, currentModelConfig?.apiKey || apiKey);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (controller.signal.aborted) {
        updateAssistantToolCallState(activeIdResolved, assistantId, updateConversation, {
          status: 'cancelled',
          error: undefined,
        });
        updateConversation(activeIdResolved, (item) => ({
          ...item,
          msgs: item.msgs.map((msg) => (msg.id === assistantId ? { ...msg, content: finalContent || '已停止生成。' } : msg)),
        }));
        return;
      }
      updateAssistantToolCallState(activeIdResolved, assistantId, updateConversation, {
        status: 'failed',
        error: message,
      });
      updateConversation(activeIdResolved, (item) => ({
        ...item,
        msgs: item.msgs.map((msg) => (msg.id === assistantId ? { ...msg, content: `Error: ${message}` } : msg)),
      }));
      addLog('error', `Chat failed: ${message}`);
    } finally {
      delete backendSessionIds.current[activeIdResolved];
      delete abortControllers.current[activeIdResolved];
      setSendings((prev) => {
        const next = new Set(prev);
        next.delete(activeIdResolved);
        return next;
      });
    }
  }, [
    activeIdResolved,
    apiKey,
    base,
    canSend,
    conv.msgs,
    currentModel,
    currentModelConfig,
    providerModel,
    currentRole.id,
    currentRole.systemPrompt,
    getMemoryContext,
    refreshMemories,
    input,
    pendingFiles,
    pendingImages,
    persistToolArtifacts,
    runToolCall,
    scheduleExtraction,
    setTokenUsageByConversation,
    tavilyApiKey,
    updateConversation,
    addLog,
    webSearchEnabled,
    useAgentStreaming,
  ]);

  const regenerate = useCallback((id?: unknown) => {
    const messageId = typeof id === 'string' ? id : conv.msgs[conv.msgs.length - 1]?.id;
    const index = conv.msgs.findIndex((msg) => msg.id === messageId);
    const previousUser = conv.msgs.slice(0, index).reverse().find((msg) => msg.role === 'user');
    if (previousUser) setInput(previousUser.content);
  }, [conv.msgs]);

  return {
    convs,
    activeId: activeIdResolved,
    conv,
    input,
    setInput,
    sendings,
    pendingImages,
    pendingFiles,
    tokenUsage: tokenUsageByConversation[activeIdResolved],
    previewUrl,
    setPreviewUrl,
    addPendingImages,
    webSearchEnabled,
    setWebSearchEnabled,
    canUseWebSearch,
    fileInputRef,
    chatModels,
    currentModel,
    currentModelDisabledReason,
    currentRole,
    canSend,
    setActiveId,
    setConvModel,
    setRole,
    newConv,
    delConv,
    deleteMessage,
    regenerate,
    cancel,
    send,
    handleFileUpload,
    removePendingImage,
    removePendingFile,
  };
}
