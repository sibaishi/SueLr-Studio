import { isDuplicateMemory, isUnsafeMemoryWriteContent, normalizeMemoryContent } from './agent-memory-policy.js';

function cleanString(value, maxLength = 5000) {
  if (value === undefined || value === null) return '';
  return String(value).trim().slice(0, maxLength);
}

const MEMORY_EXTRACTION_PROMPT = [
  '分析以下对话内容，提取关于用户的长期偏好、固定要求或稳定事实。',
  '只返回 JSON 字符串数组。',
  '每个元素都必须是一条简短的中文自然语言记忆，例如：["用户希望默认用中文回复","回答尽量分步骤","回答风格偏简洁"]。',
  '不要返回对象，不要返回 key/value，不要解释，不要 Markdown。',
  '如果没有值得长期记住的信息，返回 []。',
  '',
  '对话内容：',
  '',
].join('\n');
const MAX_EXTRACTION_MESSAGES = 8;
const MAX_EXTRACTION_MESSAGE_LENGTH = 200;
const MAX_EXTRACTED_MEMORY_LENGTH = 100;
const MIN_EXTRACTED_MEMORY_LENGTH = 4;

function profileAllowsMemoryWrite(profile) {
  if (profile?.behavior?.memoryMode === 'off') return false;
  if (!Array.isArray(profile?.enabledTools) || profile.enabledTools.length === 0) return true;
  return profile.enabledTools.includes('memory_write') || profile.enabledTools.includes('memory.write');
}

function extractTextContent(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((part) => (part && typeof part === 'object' && typeof part.text === 'string' ? part.text : ''))
    .filter(Boolean)
    .join('\n');
}

function buildExtractionText(messages, assistantMessage) {
  const normalized = [...messages, assistantMessage]
    .filter((message) => message && typeof message === 'object')
    .map((message) => ({
      role: cleanString(message.role, 20),
      content: extractTextContent(message.content),
    }))
    .filter((message) => ['user', 'assistant'].includes(message.role) && message.content);

  return normalized
    .slice(-MAX_EXTRACTION_MESSAGES)
    .map(
      (message) =>
        `${message.role === 'user' ? 'User' : 'AI'}: ${message.content.slice(0, MAX_EXTRACTION_MESSAGE_LENGTH)}`,
    )
    .join('\n');
}

function parseExtractedMemories(reply) {
  try {
    const match = cleanString(reply, 12000).match(/\[[\s\S]*\]/);
    if (!match) return [];
    const payload = JSON.parse(match[0]);
    if (!Array.isArray(payload)) return [];
    return payload
      .filter((item) => typeof item === 'string')
      .map((item) => cleanString(item, MAX_EXTRACTED_MEMORY_LENGTH))
      .filter(Boolean);
  } catch {
    return [];
  }
}

function normalizeCandidateMemory(item) {
  const text = normalizeMemoryContent(item, MAX_EXTRACTED_MEMORY_LENGTH);
  if (!text) return '';
  if (text.length < MIN_EXTRACTED_MEMORY_LENGTH) return '';
  if (isUnsafeMemoryWriteContent(text)) return '';
  return text;
}

export class AgentMemoryStrategy {
  constructor({ capabilitiesService, memoryService }) {
    this.capabilitiesService = capabilitiesService;
    this.memoryService = memoryService;
  }

  isEnabled(profile) {
    return profileAllowsMemoryWrite(profile);
  }

  async writeMemories({ profile, model, messages, assistantMessage, conversationId, apiConfig, scope, signal }) {
    if (!this.isEnabled(profile)) return [];
    const extractionText = buildExtractionText(messages, assistantMessage);
    if (!extractionText) return [];

    const response = await this.capabilitiesService.chat(
      {
        model,
        messages: [
          { role: 'system', content: MEMORY_EXTRACTION_PROMPT },
          { role: 'user', content: extractionText },
        ],
        apiConfig,
        scope,
        signal,
      },
      { scope },
    );
    const reply = response?.choices?.[0]?.message?.content;
    const candidates = parseExtractedMemories(typeof reply === 'string' ? reply : '[]')
      .map(normalizeCandidateMemory)
      .filter(Boolean);
    if (candidates.length === 0) return [];

    const existingMemories = this.memoryService.list({ scope });
    const writes = [];
    const now = Date.now();

    for (const content of candidates) {
      if (
        isDuplicateMemory(existingMemories, content, conversationId) ||
        isDuplicateMemory(writes, content, conversationId)
      ) {
        continue;
      }
      writes.push({
        scope: conversationId ? 'conversation' : 'global',
        source: 'chat',
        content,
        tags: [],
        importance: 1,
        createdAt: now + writes.length,
        updatedAt: now + writes.length,
        conversationId: conversationId || undefined,
      });
    }

    if (writes.length === 0) return [];
    this.memoryService.import(writes, { scope });
    return writes;
  }
}
