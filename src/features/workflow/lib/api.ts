import type { ProjectModel } from '@/features/workflow/lib/projectModels';
import type {
  PersistedWorkflow,
  WorkflowImportConflictDetails,
  WorkflowImportError,
  WorkflowImportMode,
  WorkflowImportReport,
} from '@/domains/workflow/types';
import { apiRequest } from '@/shared/api';

const API_BASE = import.meta.env.VITE_API_BASE || '/api';

async function apiFetch<T = unknown>(path: string, options: RequestInit = {}) {
  return apiRequest<T>(`${API_BASE}${path}`, options);
}

export interface WorkflowListItem {
  id: string;
  name: string;
  description?: string;
  nodeCount: number;
  updatedAt: number;
}

export interface WorkflowImportResult {
  success: boolean;
  data?: PersistedWorkflow;
  error?: string;
  report?: WorkflowImportReport;
  status?: number;
  importError?: WorkflowImportError;
}

function normalizeImportConflictDetails(details: unknown): WorkflowImportConflictDetails | undefined {
  if (!details || typeof details !== 'object' || Array.isArray(details)) return undefined;
  const record = details as Record<string, unknown>;
  const workflowId = typeof record.workflowId === 'string' ? record.workflowId : undefined;
  const suggestedModes = Array.isArray(record.suggestedModes)
    ? record.suggestedModes.filter((mode): mode is WorkflowImportMode => mode === 'generate_new_id' || mode === 'preserve_id' || mode === 'overwrite')
    : undefined;
  return workflowId || suggestedModes?.length ? { workflowId, suggestedModes } : undefined;
}

export async function fetchWorkflows() {
  return apiFetch<WorkflowListItem[]>('/workflows');
}

export async function fetchWorkflow(id: string) {
  return apiFetch<PersistedWorkflow>(`/workflows/${id}`);
}

export async function createWorkflow(data: PersistedWorkflow) {
  return apiFetch<PersistedWorkflow>('/workflows', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateWorkflow(id: string, data: PersistedWorkflow) {
  return apiFetch<PersistedWorkflow>(`/workflows/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteWorkflow(id: string) {
  return apiFetch(`/workflows/${id}`, { method: 'DELETE' });
}

export async function duplicateWorkflow(id: string) {
  return apiFetch(`/workflows/${id}/duplicate`, { method: 'POST' });
}

export async function exportWorkflow(id: string) {
  return apiFetch<PersistedWorkflow>(`/workflows/${id}/export`);
}

export async function importWorkflow(data: Record<string, unknown>, mode: WorkflowImportMode = 'generate_new_id'): Promise<WorkflowImportResult> {
  const generateNewId = mode === 'generate_new_id';
  const result = await apiFetch<{ workflow: PersistedWorkflow; report: WorkflowImportReport }>(`/workflows/import?generateNewId=${generateNewId ? 'true' : 'false'}&mode=${mode}`, {
    method: 'POST',
    body: JSON.stringify(data),
  });

  const normalized: WorkflowImportResult = {
    success: result.success,
    data: result.data?.workflow,
    error: result.error,
    report: result.data?.report,
    status: result.status,
  };

  if (normalized.success || !normalized.error) {
    return normalized;
  }

  return {
    ...normalized,
    importError: {
      code: result.errorCode,
      message: normalized.error,
      details: normalizeImportConflictDetails(result.errorDetails),
    },
  };
}

export interface SSECallbacks {
  onNodeStart?: (data: { nodeId: string; nodeType: string; index: number; total: number }) => void;
  onNodeProgress?: (data: { nodeId: string; progress: number; message: string }) => void;
  onNodeComplete?: (data: {
    nodeId: string;
    outputs: Record<string, unknown>;
    logOutputs?: Record<string, unknown>;
    duration: number;
  }) => void;
  onNodeError?: (data: { nodeId: string; error: string }) => void;
  onWorkflowLog?: (data: Record<string, unknown>) => void;
  onSnapshotBuilt?: (data: Record<string, unknown>) => void;
  onRunStarted?: (data: { runId: string; workflowId: string; workflowVersion: number; snapshotVersion: number; source: 'persisted' | 'draft' }) => void;
  onWorkflowComplete?: (data: { totalDuration: number; successCount: number; failCount: number }) => void;
  onWorkflowError?: (data: { error: string }) => void;
}

export async function executeWorkflow(
  workflowId: string,
  draft: { nodes: unknown[]; edges: unknown[] },
  callbacks: SSECallbacks,
  apiConfig?: Record<string, unknown>,
): Promise<void> {
  const url = `${API_BASE}/execute/${workflowId}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source: 'draft', nodes: draft.nodes, edges: draft.edges, apiConfig }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '执行失败');
    callbacks.onWorkflowError?.({ error: text });
    return;
  }

  const reader = response.body?.getReader();
  if (!reader) {
    callbacks.onWorkflowError?.({ error: '无法读取执行流' });
    return;
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let currentEvent = '';
  let currentData = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('event: ')) {
          currentEvent = line.slice(7).trim();
        } else if (line.startsWith('data: ')) {
          currentData += currentData ? `\n${line.slice(6)}` : line.slice(6);
        } else if (line === '' && currentEvent && currentData) {
          try {
            const data = JSON.parse(currentData);
            switch (currentEvent) {
              case 'workflow_node_started':
                callbacks.onNodeStart?.(data);
                break;
              case 'workflow_node_progress':
                callbacks.onNodeProgress?.(data);
                break;
              case 'workflow_node_completed':
                callbacks.onNodeComplete?.(data);
                break;
              case 'workflow_node_failed':
                callbacks.onNodeError?.(data);
                break;
              case 'workflow_log':
                callbacks.onWorkflowLog?.(data);
                break;
              case 'workflow_snapshot_built':
                callbacks.onSnapshotBuilt?.(data);
                break;
              case 'workflow_run_started':
                callbacks.onRunStarted?.(data);
                break;
              case 'workflow_run_completed':
                callbacks.onWorkflowComplete?.(data);
                break;
              case 'workflow_run_failed':
              case 'workflow_run_cancelled':
              case 'workflow_validation_failed':
                callbacks.onWorkflowError?.(data);
                break;
              default:
                break;
            }
          } catch {
            // Ignore malformed SSE chunks.
          }
          currentEvent = '';
          currentData = '';
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export async function cancelExecution(runId: string) {
  return apiFetch(`/execute/runs/${runId}/cancel`, { method: 'POST' });
}

export async function fetchExecutionStatus(runId: string) {
  return apiFetch<{
    status: string;
    runId: string;
    workflowId?: string;
    source?: string;
    snapshotVersion?: number;
    finishedAt?: number;
    totalDuration?: number;
    successCount?: number;
    failCount?: number;
    error?: string;
  }>(`/execute/runs/${runId}/status`);
}

export async function fetchSettings() {
  return apiFetch('/settings');
}

export async function updateSettings(data: Record<string, unknown>) {
  return apiFetch('/settings', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function resetSettings() {
  return apiFetch('/settings/reset', {
    method: 'POST',
  });
}

export async function testApiConnection(
  apiKey: string,
  baseUrl: string,
  providerConfig?: Record<string, unknown>,
) {
  return apiFetch<{
    message: string;
    models: string[];
    categorized: { chat: string[]; image: string[]; video: string[] };
  }>('/settings/test-api', {
    method: 'POST',
    body: JSON.stringify({ apiKey, baseUrl, providerConfig }),
  });
}

export async function discoverProviderModels(
  apiKey: string,
  baseUrl: string,
  providerConfig?: Record<string, unknown>,
) {
  return apiFetch<CategorizedModels>('/settings/discover-models', {
    method: 'POST',
    body: JSON.stringify({ apiKey, baseUrl, providerConfig }),
  });
}

export interface CategorizedModels {
  all: string[];
  chat: string[];
  image: string[];
  video: string[];
}

export async function fetchAvailableModels() {
  return apiFetch<CategorizedModels>('/settings/models');
}

export interface SettingsPayload {
  apiKey?: string;
  tavilyApiKey?: string;
  baseUrl?: string;
  projectModels?: ProjectModel[];
  providerConfig?: Record<string, unknown>;
}

export interface UploadResult {
  success: boolean;
  url?: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  error?: string;
}

export interface GeneratedOutputFile {
  id: string;
  name: string;
  relativePath: string;
  url: string;
  type: 'image' | 'video' | 'audio' | 'text' | 'data' | 'file';
  mimeType: string;
  size: number;
  modifiedAt: number;
}

export async function fetchGeneratedOutputs() {
  return apiFetch<GeneratedOutputFile[]>('/files/generated');
}

export async function uploadFile(file: File): Promise<UploadResult> {
  const formData = new FormData();
  formData.append('file', file);

  try {
    const result = await apiRequest<{
      url: string;
      fileName: string;
      fileSize: number;
      mimeType: string;
    }>(`${API_BASE}/files/upload`, {
      method: 'POST',
      body: formData,
      skipJsonContentType: true,
    });

    if (result.success && result.data) {
      return {
        success: true,
        url: result.data.url,
        fileName: result.data.fileName,
        fileSize: result.data.fileSize,
        mimeType: result.data.mimeType,
      };
    }

    return { success: false, error: result.error || '上传失败' };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '上传失败';
    if (message.includes('Failed to fetch') || message.includes('NetworkError')) {
      return { success: false, error: '无法连接到后端服务，请确认后端已经启动。' };
    }
    return { success: false, error: message };
  }
}
