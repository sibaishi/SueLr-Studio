import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createWorkflow,
  executeWorkflow,
  fetchWorkflow,
  fetchWorkflows,
  importWorkflow,
  updateWorkflow,
} from '@/domains/workflow/lib/api';
import type { PersistedWorkflow } from '@/domains/workflow/lib/persistenceTypes';

vi.mock('@/shared/api', () => ({
  apiRequest: vi.fn(),
}));

import { apiRequest } from '@/shared/api';

const workflow: PersistedWorkflow = {
  id: 'wf_test',
  name: 'Test Workflow',
  version: 1,
  createdAt: 1,
  updatedAt: 2,
  nodes: [],
  edges: [],
  settings: {},
};

describe('workflow API contract', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = originalFetch;
  });

  it('requests the workflow list from the backend workflow endpoint', async () => {
    vi.mocked(apiRequest).mockResolvedValue({ success: true, data: [] });

    await fetchWorkflows();

    expect(apiRequest).toHaveBeenCalledWith('/api/workflows', {});
  });

  it('requests a single workflow by id', async () => {
    vi.mocked(apiRequest).mockResolvedValue({ success: true, data: workflow });

    await fetchWorkflow('wf_test');

    expect(apiRequest).toHaveBeenCalledWith('/api/workflows/wf_test', {});
  });

  it('posts workflow data when creating a workflow', async () => {
    vi.mocked(apiRequest).mockResolvedValue({ success: true, data: workflow });

    await createWorkflow(workflow);

    expect(apiRequest).toHaveBeenCalledWith('/api/workflows', {
      method: 'POST',
      body: JSON.stringify(workflow),
    });
  });

  it('puts workflow data when updating a workflow', async () => {
    vi.mocked(apiRequest).mockResolvedValue({ success: true, data: workflow });

    await updateWorkflow('wf_test', workflow);

    expect(apiRequest).toHaveBeenCalledWith('/api/workflows/wf_test', {
      method: 'PUT',
      body: JSON.stringify(workflow),
    });
  });

  it('normalizes workflow import conflicts into importError details', async () => {
    vi.mocked(apiRequest).mockResolvedValue({
      success: false,
      error: 'Workflow already exists',
      errorCode: 'WORKFLOW_IMPORT_CONFLICT',
      errorDetails: {
        workflowId: 'wf_conflict',
        suggestedModes: ['overwrite', 'generate_new_id', 'invalid_mode'],
      },
      status: 409,
    });

    const result = await importWorkflow({ id: 'wf_conflict' }, 'preserve_id');

    expect(apiRequest).toHaveBeenCalledWith('/api/workflows/import?generateNewId=false&mode=preserve_id', {
      method: 'POST',
      body: JSON.stringify({ id: 'wf_conflict' }),
    });
    expect(result).toMatchObject({
      success: false,
      error: 'Workflow already exists',
      status: 409,
      importError: {
        code: 'WORKFLOW_IMPORT_CONFLICT',
        message: 'Workflow already exists',
        details: {
          workflowId: 'wf_conflict',
          suggestedModes: ['overwrite', 'generate_new_id'],
        },
      },
    });
  });

  it('normalizes execution startup envelope errors before notifying callbacks', async () => {
    const onWorkflowError = vi.fn();
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'draft 执行必须提供 nodes 数组',
          },
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      ),
    ) as typeof fetch;

    await executeWorkflow('wf_test', { name: 'Test Workflow', nodes: [], edges: [] }, { onWorkflowError });

    expect(onWorkflowError).toHaveBeenCalledWith({ error: 'draft 执行必须提供 nodes 数组' });
  });

  it('truncates non-json execution startup errors before notifying callbacks', async () => {
    const onWorkflowError = vi.fn();
    globalThis.fetch = vi.fn(async () => new Response('x'.repeat(240), { status: 502 })) as typeof fetch;

    await executeWorkflow('wf_test', { name: 'Test Workflow', nodes: [], edges: [] }, { onWorkflowError });

    const error = onWorkflowError.mock.calls[0]?.[0]?.error;
    expect(error).toMatch(/^执行失败：x{200}\.\.\.$/);
  });

  it('reports execution request failures through workflow error callbacks', async () => {
    const onWorkflowError = vi.fn();
    globalThis.fetch = vi.fn(async () => {
      throw new Error('network down');
    }) as typeof fetch;

    await executeWorkflow('wf_test', { name: 'Test Workflow', nodes: [], edges: [] }, { onWorkflowError });

    expect(onWorkflowError).toHaveBeenCalledWith({ error: '执行请求失败：network down' });
  });

  it('reports execution stream read failures through workflow error callbacks', async () => {
    const onWorkflowError = vi.fn();
    const body = new ReadableStream({
      pull(controller) {
        controller.error(new Error('stream reset'));
      },
    });
    globalThis.fetch = vi.fn(async () => new Response(body, { status: 200 })) as typeof fetch;

    await executeWorkflow('wf_test', { name: 'Test Workflow', nodes: [], edges: [] }, { onWorkflowError });

    expect(onWorkflowError).toHaveBeenCalledWith({ error: '执行连接已断开：stream reset' });
  });
});
