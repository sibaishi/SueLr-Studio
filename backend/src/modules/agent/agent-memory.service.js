import { ensureResourceOwnership } from '../../platform/runtime/index.js';
import {
  isDuplicateMemory,
  isMalformedMemoryContent,
  isUnsafeMemoryWriteContent,
  normalizeMemoryContent,
  normalizeMemoryFingerprint,
  normalizeMemoryImportance,
  normalizeMemoryTags,
} from './agent-memory-policy.js';
import { agentRepository } from './agent.repository.js';

function cleanString(value, maxLength = 5000) {
  if (value === undefined || value === null) return '';
  return String(value).trim().slice(0, maxLength);
}

function tokenizeMemoryText(value) {
  return cleanString(value, 12000)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_]+/gu, ' ')
    .split(/\s+/)
    .filter((term) => term.length >= 2);
}

function dedupeMemories(memories) {
  const byFingerprint = new Map();
  const ordered = [...memories].sort(
    (left, right) => right.updatedAt - left.updatedAt || right.createdAt - left.createdAt,
  );
  for (const memory of ordered) {
    const fingerprint = `${memory.scope}:${memory.conversationId || ''}:${normalizeMemoryFingerprint(memory.content)}`;
    if (!fingerprint.endsWith(':') && !byFingerprint.has(fingerprint)) {
      byFingerprint.set(fingerprint, memory);
    }
  }
  return Array.from(byFingerprint.values()).sort((left, right) => left.createdAt - right.createdAt);
}

function normalizeMemory(memory, scope) {
  if (!memory || typeof memory !== 'object' || Array.isArray(memory)) return null;
  const content = normalizeMemoryContent(memory.content, 12000);
  if (isMalformedMemoryContent(content)) return null;
  const now = Date.now();
  return ensureResourceOwnership(
    {
      id: cleanString(memory.id, 120) || `mem_${now}_${Math.random().toString(16).slice(2, 8)}`,
      scope: ['global', 'conversation', 'workflow'].includes(memory.scope) ? memory.scope : 'global',
      source: ['chat', 'workflow', 'manual'].includes(memory.source) ? memory.source : 'manual',
      content,
      tags: normalizeMemoryTags(memory.tags),
      importance: normalizeMemoryImportance(memory.importance),
      createdAt: Number(memory.createdAt) || now,
      updatedAt: Number(memory.updatedAt) || now,
      conversationId: cleanString(memory.conversationId, 120) || undefined,
      workflowId: cleanString(memory.workflowId, 120) || undefined,
    },
    {
      ...scope,
      userId: memory.ownerUserId || memory.ownershipScope?.userId || scope?.userId,
      workspaceId: memory.workspaceId || memory.ownershipScope?.workspaceId || scope?.workspaceId,
      runtimeMode: memory.ownershipScope?.runtimeMode || scope?.runtimeMode,
    },
  );
}

function scoreMemory(memory, query) {
  const recency = Math.max(0, 1 - (Date.now() - memory.updatedAt) / (1000 * 60 * 60 * 24 * 30));
  if (!query) return memory.importance + recency;

  const haystack = [memory.content, memory.tags.join(' '), memory.conversationId, memory.workflowId].join(' ');
  const normalizedHaystack = haystack.toLowerCase();
  const terms = tokenizeMemoryText(query);
  const exactPhraseMatch = normalizedHaystack.includes(query.toLowerCase()) ? 1 : 0;
  const termMatches = terms.reduce((score, term) => score + (normalizedHaystack.includes(term) ? 1 : 0), 0);
  const tagMatches = memory.tags.reduce((score, tag) => score + (terms.includes(tag.toLowerCase()) ? 1 : 0), 0);
  const characterOverlap =
    terms.length === 0 && query
      ? cleanString(query, 200)
          .split('')
          .filter((char) => normalizedHaystack.includes(char.toLowerCase())).length
      : 0;
  const matches = exactPhraseMatch * 3 + termMatches + tagMatches + Math.min(characterOverlap / 4, 2);
  return matches > 0 ? matches * 10 + memory.importance + recency : 0;
}

function toSearchResult(memory) {
  return {
    id: memory.id,
    scope: memory.scope,
    source: memory.source,
    content: memory.content,
    tags: memory.tags,
    importance: memory.importance,
    createdAt: memory.createdAt,
    updatedAt: memory.updatedAt,
    conversationId: memory.conversationId,
    workflowId: memory.workflowId,
    score: memory.score,
    governance: {
      role: 'context_only',
      requiresVerification: true,
      note: 'Memory is a hint, not a source of truth. Verify current code, settings, and workflows before acting.',
    },
  };
}

export class AgentMemoryService {
  constructor(repository = agentRepository) {
    this.repository = repository;
  }

  list(options = {}) {
    const current = this.repository.loadMemories();
    const normalized = current.map((item) => normalizeMemory(item, options.scope)).filter(Boolean);
    const deduped = dedupeMemories(normalized);
    if (deduped.length !== current.length || deduped.length !== normalized.length) {
      this.save(deduped);
    }
    return deduped;
  }

  save(list) {
    this.repository.saveMemories(list);
    return list;
  }

  import(records, options = {}) {
    const current = this.list(options);
    const byId = new Map(current.map((item) => [item.id, item]));
    for (const item of records) {
      const memory = normalizeMemory(item, options.scope);
      if (memory) byId.set(memory.id, memory);
    }
    const next = dedupeMemories(Array.from(byId.values()));
    this.save(next);
    return next;
  }

  write(memory, options = {}) {
    return this.import([memory], options);
  }

  writeFromTool({ content, scope, tags, importance, conversationId, requestScope } = {}) {
    const normalizedContent = normalizeMemoryContent(content, 500);
    if (isMalformedMemoryContent(normalizedContent)) {
      return {
        type: 'memory_write_result',
        status: 'rejected',
        memory: null,
        reason: 'malformed_memory_content',
      };
    }
    if (isUnsafeMemoryWriteContent(normalizedContent)) {
      return {
        type: 'memory_write_result',
        status: 'rejected',
        memory: null,
        reason: 'unsafe_memory_content',
      };
    }

    const current = this.list({ scope: requestScope });
    const normalizedConversationId = cleanString(conversationId, 120) || undefined;
    if (isDuplicateMemory(current, normalizedContent, normalizedConversationId)) {
      return {
        type: 'memory_write_result',
        status: 'deduped',
        memory: null,
        reason: 'duplicate_memory',
      };
    }

    const now = Date.now();
    const normalizedScope = scope === 'global' ? 'global' : normalizedConversationId ? 'conversation' : 'global';
    const memory = ensureResourceOwnership(
      {
        id: `mem_${now}_${Math.random().toString(16).slice(2, 8)}`,
        scope: normalizedScope,
        source: 'chat',
        content: normalizedContent,
        tags: normalizeMemoryTags(tags),
        importance: normalizeMemoryImportance(importance),
        createdAt: now,
        updatedAt: now,
        conversationId: normalizedScope === 'conversation' ? normalizedConversationId : undefined,
      },
      requestScope,
    );

    this.import([memory], { scope: requestScope });
    return {
      type: 'memory_write_result',
      status: 'written',
      memory,
      governance: {
        role: 'context_only',
        requiresVerification: true,
        workflowExecution: 'Memory must not select workflow targets or supply workflow inputs.',
      },
    };
  }

  delete(id) {
    const next = this.list().filter((item) => item.id !== id);
    this.save(next);
    return next;
  }

  clear() {
    this.save([]);
    return [];
  }

  search(query, { limit = 5, scope = undefined } = {}) {
    const q = cleanString(query, 4000);
    const matches = this.list({ scope })
      .map((memory) => ({ ...memory, score: scoreMemory(memory, q) }))
      .filter((memory) => !q || memory.score > 0)
      .sort((left, right) => right.score - left.score || right.updatedAt - left.updatedAt)
      .slice(0, Math.max(1, Number(limit) || 5))
      .map(toSearchResult);

    return matches;
  }

  buildContext(query, limit = 5, options = {}) {
    const memories = this.search(query, { limit, scope: options.scope });
    if (memories.length === 0) return '';
    return memories
      .map((memory, index) => `${index + 1}. [${memory.scope}/${memory.source}] ${memory.content}`)
      .join('\n');
  }
}

export const agentMemoryService = new AgentMemoryService();
