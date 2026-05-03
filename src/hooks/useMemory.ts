import { useState, useCallback, useEffect, useRef } from 'react';
import type { Memory } from '@/lib/types';
import { gid, loadJSON, debouncedSaveJSON, cleanKey } from '@/lib/utils';
import { MEMORY_PROMPT } from '@/lib/constants';
import { capabilityChatCompletion } from '@/domains/capabilities';

export function useMemory() {
  const [memories, setMemories] = useState<Memory[]>(loadJSON('ai_memories', []));
  const extractTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    debouncedSaveJSON('ai_memories', memories);
  }, [memories]);

  useEffect(() => {
    return () => {
      if (extractTimer.current) clearTimeout(extractTimer.current);
    };
  }, []);

  const addMemories = useCallback((items: string[], convId: string) => {
    if (items.length === 0) return;
    setMemories(prev => {
      // Deduplicate: skip if similar memory already exists
      const existing = prev.map(m => m.content);
      const newItems = items.filter(s => !existing.some(e => e.includes(s) || s.includes(e)));
      if (newItems.length === 0) return prev;
      const newMemories: Memory[] = newItems.map(content => ({
        id: gid(), content, convId, ts: Date.now(),
      }));
      return [...newMemories, ...prev].slice(0, 200);
    });
  }, []);

  const deleteMemory = useCallback((id: string) => {
    setMemories(prev => prev.filter(m => m.id !== id));
  }, []);

  const clearMemories = useCallback(() => {
    setMemories([]);
  }, []);

  // Get memory context string for system prompt
  const getMemoryContext = useCallback(() => {
    if (memories.length === 0) return '';
    const recent = memories.slice(0, 30);
    return `\n\n[用户记忆]\n以下是关于用户的一些已知信息，请在回复时参考：\n${recent.map(m => `- ${m.content}`).join('\n')}`;
  }, [memories]);

  // Schedule delayed memory extraction (fires after 3s of inactivity)
  const scheduleExtraction = useCallback(
    (
      messages: { role: string; content: string }[],
      convId: string,
      model: string,
      base: string,
      apiKey: string,
    ) => {
      if (messages.length < 2) return;
      if (extractTimer.current) clearTimeout(extractTimer.current);
      extractTimer.current = setTimeout(async () => {
        try {
          const text = messages.slice(-8).map(m => `${m.role === 'user' ? '用户' : 'AI'}: ${m.content.slice(0, 200)}`).join('\n');
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
          const match = reply.match(/\[[\s\S]*\]/);
          if (match) {
            const items: string[] = JSON.parse(match[0]);
            if (Array.isArray(items))
              addMemories(items.filter((s: any) => typeof s === 'string' && s.length > 0 && s.length < 100), convId);
          }
        } catch (e) {
          console.warn('[Memory] extraction failed:', e);
        }
      }, 3000);
    },
    [addMemories],
  );

  // Import memories from JSON string
  const importMemories = useCallback((json: string) => {
    try {
      const data = JSON.parse(json);
      if (Array.isArray(data)) {
        setMemories(data.filter((m: any) => m.id && m.content && m.ts));
      }
    } catch {}
  }, []);

  // Export memories as JSON
  const exportMemories = useCallback(() => JSON.stringify(memories, null, 2), [memories]);

  // Search memories by keyword
  const searchMemories = useCallback((query: string): string => {
    if (memories.length === 0) return '暂无关于用户的记忆。';
    const keywords = query.toLowerCase().split(/\s+/).filter(Boolean);
    const scored = memories.map(m => {
      const text = m.content.toLowerCase();
      let score = 0;
      for (const kw of keywords) {
        if (text.includes(kw)) score += 2;
        // Partial match
        for (const word of text.split('')) {
          if (kw.includes(word) || word.includes(kw)) { score += 0.5; break; }
        }
      }
      return { memory: m, score };
    }).filter(s => s.score > 0).sort((a, b) => b.score - a.score).slice(0, 10);
    if (scored.length === 0) {
      // Fallback: return recent memories
      const recent = memories.slice(0, 5);
      return `未找到与"${query}"直接相关的记忆。以下是最近的记忆：\n${recent.map(m => `- ${m.content}`).join('\n')}`;
    }
    return `找到 ${scored.length} 条相关记忆：\n${scored.map(s => `- ${s.memory.content}`).join('\n')}`;
  }, [memories]);

  return {
    memories, addMemories, deleteMemory, clearMemories,
    getMemoryContext, scheduleExtraction, importMemories, exportMemories, searchMemories,
  };
}
