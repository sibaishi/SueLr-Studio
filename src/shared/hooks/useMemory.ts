import { useState, useCallback, useEffect, useRef } from 'react';
import type { Memory } from '@/lib/types';
import { gid, loadJSON, debouncedSaveJSON, cleanKey } from '@/lib/utils';
import { MEMORY_PROMPT } from '@/lib/constants';
import { capabilityChatCompletion } from '@/shared/api/capabilities';

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
    setMemories((prev) => {
      const existing = prev.map((memory) => memory.content);
      const newItems = items.filter((item) => !existing.some((entry) => entry.includes(item) || item.includes(entry)));
      if (newItems.length === 0) return prev;
      const newMemories: Memory[] = newItems.map((content) => ({
        id: gid(),
        content,
        convId,
        ts: Date.now(),
      }));
      return [...newMemories, ...prev].slice(0, 200);
    });
  }, []);

  const deleteMemory = useCallback((id: string) => {
    setMemories((prev) => prev.filter((memory) => memory.id !== id));
  }, []);

  const clearMemories = useCallback(() => {
    setMemories([]);
  }, []);

  const getMemoryContext = useCallback(() => {
    if (memories.length === 0) return '';
    const recent = memories.slice(0, 30);
    return `\n\n[鐢ㄦ埛璁板繂]\n浠ヤ笅鏄叧浜庣敤鎴风殑涓€浜涘凡鐭ヤ俊鎭紝璇峰湪鍥炲鏃跺弬鑰冿細\n${recent.map((memory) => `- ${memory.content}`).join('\n')}`;
  }, [memories]);

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
          const text = messages
            .slice(-8)
            .map((message) => `${message.role === 'user' ? '鐢ㄦ埛' : 'AI'}: ${message.content.slice(0, 200)}`)
            .join('\n');
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
            if (Array.isArray(items)) {
              addMemories(
                items.filter((item: any) => typeof item === 'string' && item.length > 0 && item.length < 100),
                convId,
              );
            }
          }
        } catch (error) {
          console.warn('[Memory] extraction failed:', error);
        }
      }, 3000);
    },
    [addMemories],
  );

  const importMemories = useCallback((json: string) => {
    try {
      const data = JSON.parse(json);
      if (Array.isArray(data)) {
        setMemories(data.filter((memory: any) => memory.id && memory.content && memory.ts));
      }
    } catch {}
  }, []);

  const exportMemories = useCallback(() => JSON.stringify(memories, null, 2), [memories]);

  const searchMemories = useCallback(
    (query: string): string => {
      if (memories.length === 0) return '鏆傛棤鍏充簬鐢ㄦ埛鐨勮蹇嗐€?';
      const keywords = query.toLowerCase().split(/\s+/).filter(Boolean);
      const scored = memories
        .map((memory) => {
          const text = memory.content.toLowerCase();
          let score = 0;
          for (const keyword of keywords) {
            if (text.includes(keyword)) score += 2;
            for (const word of text.split('')) {
              if (keyword.includes(word) || word.includes(keyword)) {
                score += 0.5;
                break;
              }
            }
          }
          return { memory, score };
        })
        .filter((item) => item.score > 0)
        .sort((left, right) => right.score - left.score)
        .slice(0, 10);

      if (scored.length === 0) {
        const recent = memories.slice(0, 5);
        return `鏈壘鍒颁笌"${query}"鐩存帴鐩稿叧鐨勮蹇嗐€備互涓嬫槸鏈€杩戠殑璁板繂锛歕n${recent.map((memory) => `- ${memory.content}`).join('\n')}`;
      }

      return `鎵惧埌 ${scored.length} 鏉＄浉鍏宠蹇嗭細\n${scored.map((item) => `- ${item.memory.content}`).join('\n')}`;
    },
    [memories],
  );

  return {
    memories,
    addMemories,
    deleteMemory,
    clearMemories,
    getMemoryContext,
    scheduleExtraction,
    importMemories,
    exportMemories,
    searchMemories,
  };
}
