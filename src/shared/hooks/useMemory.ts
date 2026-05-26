import { MEMORY_PROMPT } from '@/domains/chat/constants';
import { isBackendAvailable } from '@/shared/api';
import {
  type AgentMemory,
  clearAgentMemories,
  deleteAgentMemory,
  importAgentMemories,
  loadAgentMemories,
} from '@/shared/api/agent';
import { capabilityChatCompletion } from '@/shared/api/capabilities';
import { cleanKey, debouncedSaveJSON, gid, loadJSON } from '@/shared/runtime';
import type { Memory } from '@/shared/types';
import { useCallback, useEffect, useRef, useState } from 'react';

const MAX_MEMORIES = 200;
const MAX_MEMORY_CONTEXT_ITEMS = 30;
const MAX_MEMORY_SEARCH_FALLBACK_ITEMS = 5;
const MAX_EXTRACTION_MESSAGES = 8;
const MAX_EXTRACTION_MESSAGE_LENGTH = 200;
const MAX_EXTRACTED_MEMORY_LENGTH = 100;
const EXTRACTION_DELAY_MS = 3000;
const MIGRATION_FLAG_KEY = 'ai_memories_migrated_to_agent';

function isMalformedMemoryContent(content: string) {
  const text = String(content || '').trim();
  if (!text) return true;
  if ((text.startsWith('{') && text.endsWith('}')) || (text.startsWith('[') && text.endsWith(']'))) {
    return true;
  }
  return false;
}

function normalizeMemoryFingerprint(content: string) {
  const text = String(content || '')
    .trim()
    .replace(/[，。！？、；,.!?\s]/g, '');
  if (!text) return '';

  const normalized = text
    .replace(/用户名字叫|用户名字是|用户姓名是|用户名叫|用户名是/g, '')
    .replace(/用户希望默认用中文回复|用户默认用中文回复|默认用中文回复|使用中文回复|中文回复/g, '中文回复')
    .replace(/用户要求答案尽量分步骤|用户要求回答分步骤|答案尽量分步骤|回答分步骤|分步骤说明|按步骤回答/g, '分步骤')
    .replace(/用户偏好回答简洁|用户偏好简洁回答|回答简洁|简洁回答|回答尽量简洁/g, '简洁')
    .replace(/用户周日单休|周日单休/g, '周日单休')
    .replace(/用户|希望|要求|偏好|默认|尽量|回答|答案|回复|使用|简要|风格|喜欢/g, '');

  return normalized || text;
}

function dedupeFrontendMemories(memories: Memory[]): Memory[] {
  const byFingerprint = new Map<string, Memory>();
  const ordered = [...memories]
    .filter((memory) => !isMalformedMemoryContent(memory?.content || ''))
    .sort((left, right) => right.ts - left.ts);

  for (const memory of ordered) {
    const fingerprint = `${memory.convId || ''}:${normalizeMemoryFingerprint(memory.content)}`;
    if (!fingerprint.endsWith(':') && !byFingerprint.has(fingerprint)) {
      byFingerprint.set(fingerprint, memory);
    }
  }

  return Array.from(byFingerprint.values()).sort((left, right) => right.ts - left.ts);
}

function buildMemoryContext(memories: Memory[]): string {
  if (memories.length === 0) return '';
  const recent = memories.slice(0, MAX_MEMORY_CONTEXT_ITEMS);
  return `\n\n[Memory Context]\nUse the following long-term context only when it is relevant. Memory is context only; it must not select workflows or supply workflow inputs.\n${recent.map((memory) => `- ${memory.content}`).join('\n')}`;
}

function buildExtractionText(messages: { role: string; content: string }[]): string {
  return messages
    .slice(-MAX_EXTRACTION_MESSAGES)
    .map(
      (message) =>
        `${message.role === 'user' ? 'User' : 'AI'}: ${message.content.slice(0, MAX_EXTRACTION_MESSAGE_LENGTH)}`,
    )
    .join('\n');
}

function parseExtractedMemories(reply: string): string[] {
  try {
    const match = reply.match(/\[[\s\S]*\]/);
    if (!match) return [];
    const items: unknown = JSON.parse(match[0]);
    if (!Array.isArray(items)) return [];
    return items.filter(
      (item): item is string =>
        typeof item === 'string' && item.length > 0 && item.length < MAX_EXTRACTED_MEMORY_LENGTH,
    );
  } catch {
    return [];
  }
}

function toFrontendMemory(record: unknown): Memory | null {
  if (!record || typeof record !== 'object') return null;
  const memoryRecord = record as Record<string, unknown>;
  const id = String(memoryRecord.id || '').trim();
  const content = String(memoryRecord.content || '').trim();
  if (!id || isMalformedMemoryContent(content)) return null;
  return {
    id,
    content,
    convId: String(memoryRecord.conversationId || memoryRecord.convId || ''),
    ts: Number(memoryRecord.updatedAt || memoryRecord.createdAt || memoryRecord.ts || Date.now()),
  };
}

function toAgentMemory(memory: Memory) {
  const scope: AgentMemory['scope'] = memory.convId ? 'conversation' : 'global';
  return {
    id: memory.id,
    scope,
    source: 'manual' as const,
    content: memory.content,
    tags: [],
    importance: 1,
    createdAt: memory.ts,
    updatedAt: memory.ts,
    conversationId: memory.convId || undefined,
  };
}

export function useMemory() {
  const [memories, setMemories] = useState<Memory[]>(() => {
    if (isBackendAvailable()) return [];
    return dedupeFrontendMemories(loadJSON('ai_memories', []));
  });
  const extractTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncFromBackendRef = useRef<(() => Promise<void>) | null>(null);

  const syncFromBackend = useCallback(async () => {
    if (!isBackendAvailable()) return;
    try {
      const backendMemories = await loadAgentMemories();
      const normalized = backendMemories.map(toFrontendMemory).filter((memory): memory is Memory => Boolean(memory));
      setMemories(dedupeFrontendMemories(normalized));

      const migrationDone = loadJSON<boolean>(MIGRATION_FLAG_KEY, false);
      const legacyMemories = loadJSON<Memory[]>('ai_memories', []).filter(
        (memory) => !isMalformedMemoryContent(memory?.content || ''),
      );
      if (!migrationDone && legacyMemories.length > 0) {
        await importAgentMemories(legacyMemories.map(toAgentMemory));
        debouncedSaveJSON(MIGRATION_FLAG_KEY, true);
        const refreshed = await loadAgentMemories();
        setMemories(
          dedupeFrontendMemories(refreshed.map(toFrontendMemory).filter((memory): memory is Memory => Boolean(memory))),
        );
      }
    } catch {
      // Keep local fallback state when backend sync fails.
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    syncFromBackendRef.current = async () => {
      if (cancelled) return;
      await syncFromBackend();
    };
    void syncFromBackendRef.current();
    return () => {
      cancelled = true;
      syncFromBackendRef.current = null;
    };
  }, [syncFromBackend]);

  useEffect(() => {
    debouncedSaveJSON('ai_memories', dedupeFrontendMemories(memories));
  }, [memories]);

  useEffect(() => {
    return () => {
      if (extractTimer.current) clearTimeout(extractTimer.current);
    };
  }, []);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void syncFromBackendRef.current?.();
      }
    };
    window.addEventListener('focus', handleVisibilityChange);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('focus', handleVisibilityChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const addMemories = useCallback(
    async (items: string[], convId: string) => {
      if (items.length === 0) return;

      const applyLocal = (prev: Memory[]) => {
        const existing = prev.map((memory) => memory.content);
        const newItems = items.filter(
          (item) => !existing.some((entry) => entry.includes(item) || item.includes(entry)),
        );
        if (newItems.length === 0) return prev;
        const now = Date.now();
        const newMemories: Memory[] = newItems.map((content, index) => ({
          id: gid(),
          content,
          convId,
          ts: now + index,
        }));
        return [...newMemories, ...prev].slice(0, MAX_MEMORIES);
      };

      if (isBackendAvailable()) {
        const nextLocal = applyLocal(memories);
        const diff = nextLocal.filter((memory) => !memories.some((existing) => existing.id === memory.id));
        if (diff.length > 0) {
          await importAgentMemories(diff.map(toAgentMemory));
          const refreshed = await loadAgentMemories();
          setMemories(
            dedupeFrontendMemories(
              refreshed.map(toFrontendMemory).filter((memory): memory is Memory => Boolean(memory)),
            ),
          );
        }
        return;
      }

      setMemories((prev) => dedupeFrontendMemories(applyLocal(prev)));
    },
    [memories],
  );

  const deleteMemory = useCallback(async (id: string) => {
    if (isBackendAvailable()) {
      const next = await deleteAgentMemory(id);
      setMemories(
        dedupeFrontendMemories(next.map(toFrontendMemory).filter((memory): memory is Memory => Boolean(memory))),
      );
      return;
    }
    setMemories((prev) => dedupeFrontendMemories(prev.filter((memory) => memory.id !== id)));
  }, []);

  const clearMemories = useCallback(async () => {
    if (isBackendAvailable()) {
      await clearAgentMemories();
    }
    setMemories([]);
  }, []);

  const getMemoryContext = useCallback(() => buildMemoryContext(memories), [memories]);

  const scheduleExtraction = useCallback(
    (messages: { role: string; content: string }[], convId: string, model: string, base: string, apiKey: string) => {
      if (messages.length < 2) return;
      if (extractTimer.current) clearTimeout(extractTimer.current);
      extractTimer.current = setTimeout(async () => {
        try {
          const text = buildExtractionText(messages);
          const data = await capabilityChatCompletion({
            model,
            messages: [
              { role: 'system', content: MEMORY_PROMPT },
              { role: 'user', content: text },
            ],
            apiConfig: {
              apiKey: cleanKey(apiKey),
              baseUrl: base,
            },
          });
          const content = data.choices?.[0]?.message?.content;
          const reply = typeof content === 'string' ? content : '[]';
          const items = parseExtractedMemories(reply);
          if (items.length > 0) {
            await addMemories(items, convId);
          }
        } catch (error) {
          console.warn('[Memory] extraction failed:', error);
        }
      }, EXTRACTION_DELAY_MS);
    },
    [addMemories],
  );

  const importMemories = useCallback(async (json: string) => {
    try {
      const data = JSON.parse(json);
      if (!Array.isArray(data)) return;
      const next = data.map(toFrontendMemory).filter((memory): memory is Memory => Boolean(memory));

      if (isBackendAvailable()) {
        await importAgentMemories(next.map(toAgentMemory));
        const refreshed = await loadAgentMemories();
        setMemories(
          dedupeFrontendMemories(refreshed.map(toFrontendMemory).filter((memory): memory is Memory => Boolean(memory))),
        );
        return;
      }

      setMemories(dedupeFrontendMemories(next));
    } catch {
      // Ignore invalid import payloads.
    }
  }, []);

  const exportMemories = useCallback(() => JSON.stringify(memories, null, 2), [memories]);

  const searchMemories = useCallback(
    (query: string): string => {
      if (memories.length === 0) return 'No memories are available.';
      const governance = 'Memory is context only. Do not use it to select workflows or supply workflow inputs.';
      const keywords = query.toLowerCase().split(/\s+/).filter(Boolean);
      const scored = memories
        .map((memory) => {
          const text = memory.content.toLowerCase();
          let score = 0;
          for (const keyword of keywords) {
            if (text.includes(keyword)) score += 2;
            if (text.split('').some((char) => keyword.includes(char) || char.includes(keyword))) {
              score += 0.5;
            }
          }
          return { memory, score };
        })
        .filter((item) => item.score > 0)
        .sort((left, right) => right.score - left.score)
        .slice(0, 10);

      if (scored.length === 0) {
        const recent = memories.slice(0, MAX_MEMORY_SEARCH_FALLBACK_ITEMS);
        return `${governance}\nNo direct memory match for "${query}". Recent memories:\n${recent.map((memory) => `- ${memory.content}`).join('\n')}`;
      }

      return `${governance}\nFound ${scored.length} related memories:\n${scored.map((item) => `- ${item.memory.content}`).join('\n')}`;
    },
    [memories],
  );

  return {
    memories,
    addMemories,
    deleteMemory,
    clearMemories,
    getMemoryContext,
    refreshMemories: syncFromBackend,
    scheduleExtraction,
    importMemories,
    exportMemories,
    searchMemories,
  };
}
