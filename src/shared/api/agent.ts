import { apiRequestOrThrow, isBackendAvailable } from '@/shared/api';

const API = '/api/agent';

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
