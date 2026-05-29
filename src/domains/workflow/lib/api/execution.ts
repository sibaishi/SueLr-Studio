import { API_BASE, workflowApiFetch } from '@/domains/workflow/lib/api/base';
import type { ApiEnvelope } from '@/shared/api';

export interface WorkflowIterationContext {
  sourceNodeId: string;
  index: number;
  total: number;
  inputHandle?: string;
  sourceInputNodeId?: string;
  sourceHandle?: string;
}

export interface SSECallbacks {
  onNodeStart?: (data: {
    nodeId: string;
    nodeType: string;
    index: number;
    total: number;
    iteration?: WorkflowIterationContext;
  }) => void;
  onNodeProgress?: (data: {
    nodeId: string;
    progress: number;
    message: string;
    iteration?: WorkflowIterationContext;
  }) => void;
  onNodeComplete?: (data: {
    nodeId: string;
    outputs: Record<string, unknown>;
    logOutputs?: Record<string, unknown>;
    duration: number;
    iteration?: WorkflowIterationContext;
  }) => void;
  onNodeError?: (data: { nodeId: string; error: string; iteration?: WorkflowIterationContext }) => void;
  onWorkflowLog?: (data: Record<string, unknown>) => void;
  onSnapshotBuilt?: (data: Record<string, unknown>) => void;
  onRunStarted?: (data: {
    runId: string;
    workflowId: string;
    workflowVersion: number;
    snapshotVersion: number;
    source: 'persisted' | 'draft';
  }) => void;
  onWorkflowComplete?: (data: { totalDuration: number; successCount: number; failCount: number }) => void;
  onWorkflowError?: (data: { error: string }) => void;
}

function getEnvelopeErrorMessage(payload: ApiEnvelope<unknown> | null) {
  const error = payload?.error;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && typeof error.message === 'string') return error.message;
  return null;
}

function truncatePlainTextError(text: string) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return null;
  return normalized.length > 200 ? `${normalized.slice(0, 200)}...` : normalized;
}

async function readExecutionErrorMessage(response: Response) {
  const text = await response.text().catch(() => '');
  try {
    const payload = text ? (JSON.parse(text) as ApiEnvelope<unknown>) : null;
    return getEnvelopeErrorMessage(payload) || `执行失败：HTTP ${response.status}`;
  } catch {
    const plainText = truncatePlainTextError(text);
    return plainText ? `执行失败：${plainText}` : `执行失败：HTTP ${response.status}`;
  }
}

function getUnknownErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export async function executeWorkflow(
  workflowId: string,
  draft: { name?: string; nodes: unknown[]; edges: unknown[] },
  callbacks: SSECallbacks,
  apiConfig?: Record<string, unknown>,
): Promise<void> {
  const url = `${API_BASE}/execute/${workflowId}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'draft', name: draft.name, nodes: draft.nodes, edges: draft.edges, apiConfig }),
    });
  } catch (error) {
    callbacks.onWorkflowError?.({ error: `执行请求失败：${getUnknownErrorMessage(error, '网络请求失败')}` });
    return;
  }

  if (!response.ok) {
    callbacks.onWorkflowError?.({ error: await readExecutionErrorMessage(response) });
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
  } catch (error) {
    callbacks.onWorkflowError?.({ error: `执行连接已断开：${getUnknownErrorMessage(error, '无法读取执行流')}` });
  } finally {
    reader.releaseLock();
  }
}

export async function cancelExecution(runId: string) {
  return workflowApiFetch(`/execute/runs/${runId}/cancel`, { method: 'POST' });
}

export async function fetchExecutionStatus(runId: string) {
  return workflowApiFetch<{
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
