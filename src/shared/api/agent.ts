import { apiRequestOrThrow, isBackendAvailable } from '@/shared/api';
import type { ContentPart } from '@/shared/types';
import type { ApiConfigPayload } from '@/shared/api/capabilities';

const API = '/api/agent';

export type AgentProfile = {
  id: string;
  name: string;
  icon?: string;
  description?: string;
  instruction: string;
  enabledTools: string[];
  defaultModel?: string;
  behavior?: {
    responseStyle?: string;
    memoryMode?: string;
  };
  isCustom?: boolean;
};

export type AgentMemory = {
  id: string;
  scope: 'global' | 'conversation' | 'workflow';
  source: 'chat' | 'workflow' | 'manual';
  content: string;
  tags: string[];
  importance: number;
  createdAt: number;
  updatedAt: number;
  conversationId?: string;
  workflowId?: string;
};

export type AgentChatMessage = {
  role: string;
  content: string | ContentPart[];
  tool_calls?: any[];
};

export type AgentChatResult = {
  sessionId: string;
  conversationId?: string;
  profileId?: string;
  model?: string;
  agentRunLog?: {
    runId: string;
  };
  assistantMessage: {
    role: string;
    content: string;
    tool_calls?: any[];
  };
  toolTrace: Array<{
    name: string;
    args: Record<string, unknown>;
    result: unknown;
  }>;
  memoryWrites: unknown[];
  tokenUsage?: {
    source: 'provider' | 'estimate';
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    compressionThreshold: number;
    remainingTokens: number;
    usagePct: number;
  };
};

export async function loadAgentProfiles(): Promise<AgentProfile[]> {
  if (!isBackendAvailable()) return [];
  return apiRequestOrThrow<AgentProfile[]>(`${API}/profiles`);
}

export async function saveAgentProfiles(profiles: AgentProfile[]): Promise<AgentProfile[]> {
  return apiRequestOrThrow<AgentProfile[]>(`${API}/profiles`, {
    method: 'POST',
    body: JSON.stringify(profiles),
  });
}

export async function loadAgentMemories(): Promise<AgentMemory[]> {
  if (!isBackendAvailable()) return [];
  return apiRequestOrThrow<AgentMemory[]>(`${API}/memories`);
}

export async function importAgentMemories(memories: AgentMemory[]): Promise<AgentMemory[]> {
  return apiRequestOrThrow<AgentMemory[]>(`${API}/memories/import`, {
    method: 'POST',
    body: JSON.stringify({ memories }),
  });
}

export async function deleteAgentMemory(id: string): Promise<AgentMemory[]> {
  return apiRequestOrThrow<AgentMemory[]>(`${API}/memories/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function clearAgentMemories(): Promise<AgentMemory[]> {
  return apiRequestOrThrow<AgentMemory[]>(`${API}/memories`, {
    method: 'DELETE',
  });
}

export async function sendAgentChat(params: {
  conversationId?: string;
  profileId?: string;
  model: string;
  messages: AgentChatMessage[];
  attachments?: unknown[];
  options?: {
    stream?: boolean;
    allowWebSearch?: boolean;
  };
  apiConfig?: ApiConfigPayload;
  signal?: AbortSignal;
}) {
  return apiRequestOrThrow<AgentChatResult>(`${API}/chat`, {
    method: 'POST',
    body: JSON.stringify(params),
    signal: params.signal,
  });
}

export async function sendAgentChatStream(params: {
  conversationId?: string;
  profileId?: string;
  model: string;
  messages: AgentChatMessage[];
  attachments?: unknown[];
  options?: {
    stream?: boolean;
    allowWebSearch?: boolean;
  };
  apiConfig?: ApiConfigPayload;
  signal?: AbortSignal;
}) {
  const response = await fetch(`${API}/chat?stream=true`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ...params,
      options: {
        ...params.options,
        stream: true,
      },
    }),
    signal: params.signal,
  });

  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const payload = await response.json() as { error?: { message?: string } };
      if (payload?.error?.message) {
        message = payload.error.message;
      }
    } catch {
      // Ignore parse failures and keep the HTTP fallback.
    }
    throw new Error(message);
  }

  return response;
}

export async function getAgentSession(sessionId: string) {
  return apiRequestOrThrow(`${API}/sessions/${encodeURIComponent(sessionId)}`);
}

export async function cancelAgentSession(sessionId: string) {
  return apiRequestOrThrow(`${API}/sessions/${encodeURIComponent(sessionId)}/cancel`, {
    method: 'POST',
  });
}
