import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AgentRole, BridgeRef, ChatMsg, Conv, ModelInfo } from '@/lib/types';
import type { ProviderConfig } from '@/lib/providers';
import { gid, loadJSON, debouncedSaveJSON } from '@/lib/utils';
import { deleteConversation, loadConversations, saveConversations } from '@/shared/api/assistant';
import { capabilityWebSearch, isBackendAvailable } from '@/shared/api';
import { useProvider } from '@/shared/hooks/provider';
import { buildTools } from '@/lib/constants';

type PendingFile = {
  id: string;
  name: string;
  type: string;
  content: string;
};

type UseChatResult = {
  convs: Conv[];
  activeId: string;
  conv: Conv;
  input: string;
  setInput: (value: string) => void;
  sendings: Set<string>;
  pendingImages: string[];
  pendingFiles: PendingFile[];
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
  return { id: gid(), title: '新对话', model, roleId, msgs: [], ts: Date.now() };
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

export function useChat(
  base: string,
  apiKey: string,
  models: ModelInfo[],
  addLog: (level: string, message: string) => void,
  bridgeRef: React.MutableRefObject<BridgeRef>,
  roles: AgentRole[],
  getMemoryContext: () => string,
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
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [webSearchEnabled, setWebSearchEnabled] = useState(() => loadJSON<boolean>(WEB_SEARCH_KEY, false));
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const abortControllers = useRef<Record<string, AbortController>>({});
  const { getProvider } = useProvider(base, apiKey, providerConfig);

  const activeIdResolved = activeId && convs.some((conv) => conv.id === activeId) ? activeId : convs[0]?.id || '';
  const conv = convs.find((item) => item.id === activeIdResolved) || convs[0] || createConversation(defaultModel, roles[0]?.id);
  const savedModelIsChat = chatModels.some((model) => model.id === conv.model);
  const currentModel = savedModelIsChat ? conv.model : defaultModel;
  const currentRole = roles.find((role) => role.id === conv.roleId) || roles[0] || { id: 'default', name: '默认', icon: 'bot', systemPrompt: '', tools: [] };
  const currentModelDisabledReason = currentModel ? '' : '请先在设置中配置可用的对话模型。';
  const canUseWebSearch = Boolean(tavilyApiKey);
  const canSend = Boolean((input.trim() || pendingImages.length > 0 || pendingFiles.length > 0) && currentModel && !sendings.has(conv.id));

  useEffect(() => {
    if (!activeIdResolved && convs.length > 0) setActiveIdState(convs[0].id);
  }, [activeIdResolved, convs]);

  useEffect(() => {
    if (isBackendAvailable()) {
      void saveConversations(convs);
      return;
    }
    debouncedSaveJSON(STORAGE_KEY, convs);
  }, [convs]);

  useEffect(() => {
    debouncedSaveJSON(ACTIVE_KEY, activeIdResolved);
  }, [activeIdResolved]);

  useEffect(() => {
    debouncedSaveJSON(WEB_SEARCH_KEY, webSearchEnabled);
  }, [webSearchEnabled]);

  useEffect(() => {
    if (!isBackendAvailable()) return;
    void loadConversations().then((serverConvs) => {
      setConvs((current) => mergeServerConversations(serverConvs, current, defaultModel, roles[0]?.id));
    });
  }, [defaultModel, roles]);

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
    if (!chatModels.some((item) => item.id === model)) return;
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
    delete abortControllers.current[id];
    setSendings((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const addPendingImages = useCallback((urls: string[]) => {
    setPendingImages((prev) => [...prev, ...urls]);
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

  const handleFileUpload = useCallback((files: FileList | File[]) => {
    const items = Array.from(files);
    const imageFiles = items.filter((file) => file.type.startsWith('image/'));
    const textFiles = items.filter((file) => !file.type.startsWith('image/') && canReadAsText(file) && file.size <= 1024 * 1024);
    const skippedFiles = items.filter((file) => !file.type.startsWith('image/') && (!canReadAsText(file) || file.size > 1024 * 1024));

    if (imageFiles.length > 0) {
      void Promise.all(imageFiles.map(fileToDataUrl))
        .then(addPendingImages)
        .catch((error) => addLog('error', `图片上传失败: ${error instanceof Error ? error.message : String(error)}`));
    }

    if (textFiles.length > 0) {
      void Promise.all(textFiles.map(async (file) => ({
        id: gid(),
        name: file.name,
        type: file.type || 'text/plain',
        content: await fileToText(file),
      })))
        .then((nextFiles) => setPendingFiles((prev) => [...prev, ...nextFiles]))
        .catch((error) => addLog('error', `文件读取失败: ${error instanceof Error ? error.message : String(error)}`));
    }

    if (skippedFiles.length > 0) {
      addLog('warn', `暂不支持直接读取这些文件: ${skippedFiles.map((file) => file.name).join(', ')}`);
    }
  }, [addLog, addPendingImages]);

  const runToolCall = useCallback(async (toolCall: { id?: string; function?: { name?: string; arguments?: string } }) => {
    const name = toolCall.function?.name || '';
    const args = parseToolArguments(toolCall.function?.arguments);

    if (name === 'web_search') {
      if (!tavilyApiKey) return '未配置 Tavily API Key，无法联网搜索。';
      const query = String(args.query || '').trim();
      if (!query) return '缺少搜索关键词。';
      const data = await capabilityWebSearch({ query, maxResults: 5, includeAnswer: true, apiConfig: { tavilyApiKey } });
      return data.content || JSON.stringify(data.raw ?? {});
    }

    if (name === 'search_memory') {
      const query = String(args.query || '').trim();
      return searchMemories?.(query) || '没有找到相关记忆。';
    }

    if (name === 'get_current_time') {
      const timezone = String(args.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai');
      return new Date().toLocaleString('zh-CN', { timeZone: timezone });
    }

    if (name === 'summarize_conversation') {
      return conv.msgs.map((msg) => `${msg.role}: ${msg.content}`).join('\n').slice(-6000);
    }

    return `工具 ${name || 'unknown'} 在 Chat 中不可用。`;
  }, [conv.msgs, searchMemories, tavilyApiKey]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!canSend || !activeIdResolved || !currentModel) return;

    const fileContext = pendingFiles.map((file) => `\n\n[附件: ${file.name}]\n${file.content}`).join('');
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
      title: item.msgs.length === 0 ? (text || pendingFiles[0]?.name || '图片消息').slice(0, 30) : item.title,
      msgs: [...item.msgs, userMessage, assistantMessage],
      ts: Date.now(),
    }));

    try {
      const memoryContext = getMemoryContext();
      const searchPrompt = webSearchEnabled && tavilyApiKey
        ? '本轮对话已开启联网搜索。涉及事实、新闻、价格、版本、文档、时间敏感信息或用户要求查询时，先调用 web_search，再基于搜索结果回答。'
        : '';
      const systemPrompt = [currentRole.systemPrompt, memoryContext, searchPrompt].filter(Boolean).join('\n\n');
      const sourceMessages = [...conv.msgs, userMessage].map((msg) => {
        if (msg.images.length === 0) return { role: msg.role, content: msg.content };
        return {
          role: msg.role,
          content: [
            { type: 'text' as const, text: msg.content || '请分析这些图片。' },
            ...msg.images.map((image) => ({ type: 'image_url' as const, image_url: { url: image } })),
          ],
        };
      });
      const tools = buildTools(false, false, webSearchEnabled && Boolean(tavilyApiKey));
      const result = await getProvider().chatCompletion({
        model: currentModel,
        messages: [
          ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
          ...sourceMessages,
        ],
        tools,
        signal: controller.signal,
      });
      let finalContent = result.content;
      if (result.toolCalls && result.toolCalls.length > 0) {
        const toolMessages = await Promise.all(result.toolCalls.map(async (toolCall) => ({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: await runToolCall(toolCall),
        })));
        const toolResult = await getProvider().chatCompletion({
          model: currentModel,
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
      updateConversation(activeIdResolved, (item) => ({
        ...item,
        msgs: item.msgs.map((msg) => (msg.id === assistantId ? { ...msg, content: finalContent } : msg)),
      }));
      const extractionMessages = [...conv.msgs, userMessage].map((msg) => ({ role: msg.role, content: msg.content })).concat({ role: 'assistant', content: finalContent });
      scheduleExtraction(extractionMessages, activeIdResolved, currentModel, base, apiKey);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      updateConversation(activeIdResolved, (item) => ({
        ...item,
        msgs: item.msgs.map((msg) => (msg.id === assistantId ? { ...msg, content: `错误: ${message}` } : msg)),
      }));
      addLog('error', `聊天失败: ${message}`);
    } finally {
      delete abortControllers.current[activeIdResolved];
      setSendings((prev) => {
        const next = new Set(prev);
        next.delete(activeIdResolved);
        return next;
      });
    }
  }, [activeIdResolved, apiKey, base, canSend, conv.msgs, currentModel, currentRole.systemPrompt, getMemoryContext, getProvider, input, pendingFiles, pendingImages, runToolCall, scheduleExtraction, tavilyApiKey, updateConversation, addLog, webSearchEnabled]);

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
    previewUrl,
    setPreviewUrl,
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
    addPendingImages,
    removePendingImage,
    removePendingFile,
  };
}
