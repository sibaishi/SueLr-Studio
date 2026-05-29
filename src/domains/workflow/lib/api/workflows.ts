import type {
  PersistedWorkflow,
  WorkflowImportConflictDetails,
  WorkflowImportError,
  WorkflowImportMode,
  WorkflowImportReport,
} from '@/domains/workflow/lib/persistenceTypes';
import { workflowApiFetch } from '@/domains/workflow/lib/api/base';

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
    ? record.suggestedModes.filter(
        (mode): mode is WorkflowImportMode =>
          mode === 'generate_new_id' || mode === 'preserve_id' || mode === 'overwrite',
      )
    : undefined;
  return workflowId || suggestedModes?.length ? { workflowId, suggestedModes } : undefined;
}

export async function fetchWorkflows() {
  return workflowApiFetch<WorkflowListItem[]>('/workflows');
}

export async function fetchWorkflow(id: string) {
  return workflowApiFetch<PersistedWorkflow>(`/workflows/${id}`);
}

export async function createWorkflow(data: PersistedWorkflow) {
  return workflowApiFetch<PersistedWorkflow>('/workflows', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateWorkflow(id: string, data: PersistedWorkflow) {
  return workflowApiFetch<PersistedWorkflow>(`/workflows/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteWorkflow(id: string) {
  return workflowApiFetch(`/workflows/${id}`, { method: 'DELETE' });
}

export async function duplicateWorkflow(id: string) {
  return workflowApiFetch(`/workflows/${id}/duplicate`, { method: 'POST' });
}

export async function exportWorkflow(id: string) {
  return workflowApiFetch<PersistedWorkflow>(`/workflows/${id}/export`);
}

export async function importWorkflow(
  data: Record<string, unknown>,
  mode: WorkflowImportMode = 'generate_new_id',
): Promise<WorkflowImportResult> {
  const generateNewId = mode === 'generate_new_id';
  const result = await workflowApiFetch<{ workflow: PersistedWorkflow; report: WorkflowImportReport }>(
    `/workflows/import?generateNewId=${generateNewId ? 'true' : 'false'}&mode=${mode}`,
    {
      method: 'POST',
      body: JSON.stringify(data),
    },
  );

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

export async function importWorkflowDraft(data: Record<string, unknown>): Promise<WorkflowImportResult> {
  const result = await workflowApiFetch<{ workflow: PersistedWorkflow; report: WorkflowImportReport }>(
    '/workflows/import/draft',
    {
      method: 'POST',
      body: JSON.stringify(data),
    },
  );

  return {
    success: result.success,
    data: result.data?.workflow,
    error: result.error,
    report: result.data?.report,
    status: result.status,
    importError: result.error
      ? {
          code: result.errorCode,
          message: result.error,
        }
      : undefined,
  };
}
