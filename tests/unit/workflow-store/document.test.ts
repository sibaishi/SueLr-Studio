import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PersistedWorkflow, WorkflowImportReport } from '@/features/workflow/lib/persistenceTypes';
import { createWorkflowDocumentActions } from '@/features/workflow/lib/store/document';
import { createWorkflowStoreHarness } from './testHarness';

vi.mock('@/features/workflow/lib/api', () => ({
  updateWorkflow: vi.fn(),
  createWorkflow: vi.fn(),
  fetchWorkflow: vi.fn(),
  fetchWorkflows: vi.fn(),
  duplicateWorkflow: vi.fn(),
  deleteWorkflow: vi.fn(),
  importWorkflow: vi.fn(),
}));

vi.mock('@/features/workflow/lib/store/persistence', () => ({
  clearActiveRunSnapshot: vi.fn(),
  loadLocalDraft: vi.fn(() => null),
}));

import * as api from '@/features/workflow/lib/api';
import { clearActiveRunSnapshot } from '@/features/workflow/lib/store/persistence';

function createPersistedWorkflow(overrides: Partial<PersistedWorkflow> = {}): PersistedWorkflow {
  return {
    id: 'wf_remote',
    name: 'Imported Workflow',
    version: 1,
    createdAt: 100,
    updatedAt: 200,
    nodes: [],
    edges: [],
    settings: {},
    ...overrides,
  };
}

function createWorkflowImportReport(overrides: Partial<WorkflowImportReport> = {}): WorkflowImportReport {
  return {
    sourceVersion: 1,
    targetVersion: 1,
    appliedMigrations: [],
    warnings: [],
    rejectedFields: [],
    result: 'imported',
    ...overrides,
  };
}

describe('workflow store document actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads a workflow and clears stale runtime state', async () => {
    vi.mocked(api.fetchWorkflow).mockResolvedValue({
      success: true,
      data: createPersistedWorkflow({
        id: 'wf_loaded',
        name: 'Loaded Workflow',
        updatedAt: 3456,
        nodes: [
          { id: 'outside', type: 'textInput', position: { x: 0, y: 0 }, data: {} },
          { id: 'group', type: 'group', position: { x: 196, y: 0 }, data: {} },
          { id: 'inner', type: 'aiChat', position: { x: 56, y: 84 }, ui: { parentId: 'group', extent: 'parent' }, data: {} },
        ],
        edges: [
          { id: 'edge_in', source: 'outside', sourceHandle: 'text', target: 'inner', targetHandle: 'prompt' },
          { id: 'edge_out', source: 'inner', sourceHandle: 'response', target: 'outside', targetHandle: 'text' },
          { id: 'edge_invalid', source: 'outside', target: 'missing_node' },
        ],
      }),
    });

    const persistLocalDraft = vi.fn();
    const harness = createWorkflowStoreHarness({
      workflowId: 'wf_old',
      workflowName: 'Stale Workflow',
      nodes: [{ id: 'stale', type: 'textInput', position: { x: 0, y: 0 }, data: {} }],
      edges: [{ id: 'edge_stale', source: 'stale', target: 'stale' }],
      isExecuting: true,
      currentRunId: 'run_old',
      executingNodeId: 'stale',
      lastExecutionStatus: 'error',
      lastExecutionTime: 99,
      lastExecutionError: 'stale error',
      lastExecutionSummary: { successCount: 0, failCount: 1, totalDuration: 99 },
      nodeExecStatus: { stale: 'error' },
      nodeExecutionTime: { stale: 99 },
      nodeExecutionStartedAt: { stale: 1 },
      nodeErrors: { stale: 'stale error' },
      nodeWarnings: { stale: 'stale warning' },
      nodeOutputs: { stale: { text: 'stale' } },
      aiResultOutputs: { stale: { image: 'stale' } },
      executionLogs: [{ id: 'log_old', timestamp: 1, level: 'error', message: 'stale' }],
      workflowWarningMessage: 'stale warning',
      hasUnsavedChanges: true,
      persistLocalDraft,
    });

    const actions = createWorkflowDocumentActions(harness.set, harness.get, { initialDraft: null });
    harness.attachActions(actions);

    const result = await actions.loadWorkflow('wf_loaded');
    const state = harness.getState();

    expect(result).toBe(true);
    expect(clearActiveRunSnapshot).toHaveBeenCalledTimes(1);
    expect(state.workflowId).toBe('wf_loaded');
    expect(state.workflowName).toBe('Loaded Workflow');
    expect(state.nodes).toHaveLength(3);
    expect(state.edges).toHaveLength(2);
    const groupData = (state.nodes.find((node) => node.id === 'group')?.data || {}) as {
      groupInputs?: unknown[];
      groupOutputs?: unknown[];
    };
    expect(groupData.groupInputs?.[0]).toMatchObject({
      type: 'string',
      binding: { nodeId: 'inner', handleId: 'prompt' },
    });
    expect(groupData.groupOutputs?.[0]).toMatchObject({
      type: 'string',
      binding: { nodeId: 'inner', handleId: 'response' },
    });
    expect(state.isExecuting).toBe(false);
    expect(state.currentRunId).toBeNull();
    expect(state.nodeExecStatus).toEqual({});
    expect(state.executionLogs).toEqual([]);
    expect(state.workflowWarningMessage).toBeNull();
    expect(state.hasUnsavedChanges).toBe(false);
    expect(state.lastSavedAt).toBe(3456);
    expect(persistLocalDraft).toHaveBeenCalledTimes(1);
  });

  it('hydrates the first saved workflow when no local draft exists', async () => {
    vi.mocked(api.fetchWorkflows).mockResolvedValue({
      success: true,
      data: [
        { id: 'wf_first', name: 'First Workflow', nodeCount: 1, updatedAt: 10 },
      ],
    });
    vi.mocked(api.fetchWorkflow).mockResolvedValue({
      success: true,
      data: createPersistedWorkflow({
        id: 'wf_first',
        name: 'First Workflow',
      }),
    });

    const persistLocalDraft = vi.fn();
    const harness = createWorkflowStoreHarness({ persistLocalDraft });
    const actions = createWorkflowDocumentActions(harness.set, harness.get, { initialDraft: null });
    harness.attachActions(actions);

    await actions.initializeWorkflowPersistence();

    const state = harness.getState();
    expect(api.fetchWorkflows).toHaveBeenCalledTimes(1);
    expect(api.fetchWorkflow).toHaveBeenCalledWith('wf_first');
    expect(state.isHydratingWorkflow).toBe(false);
    expect(state.workflowList).toHaveLength(1);
    expect(state.workflowId).toBe('wf_first');
    expect(persistLocalDraft).toHaveBeenCalled();
  });

  it('imports workflow data, resets runtime state, and marks the draft dirty', async () => {
    vi.mocked(api.importWorkflow).mockResolvedValue({
      success: true,
      data: createPersistedWorkflow({
        id: 'wf_imported',
        name: 'Imported Flow',
        nodes: [
          { id: 'outside', type: 'textInput', position: { x: 0, y: 0 }, data: {} },
          { id: 'group', type: 'group', position: { x: 196, y: 0 }, data: {} },
          { id: 'inner', type: 'aiChat', position: { x: 56, y: 84 }, ui: { parentId: 'group', extent: 'parent' }, data: {} },
        ],
        edges: [
          { id: 'edge_in', source: 'outside', sourceHandle: 'text', target: 'inner', targetHandle: 'prompt' },
        ],
      }),
      report: createWorkflowImportReport(),
    });

    const persistLocalDraft = vi.fn();
    const harness = createWorkflowStoreHarness({
      isExecuting: true,
      currentRunId: 'run_old',
      nodeExecStatus: { stale: 'running' },
      persistLocalDraft,
    });
    const actions = createWorkflowDocumentActions(harness.set, harness.get, { initialDraft: null });
    harness.attachActions(actions);

    const result = await actions.importWorkflowDataWithMode({ id: 'incoming' }, 'generate_new_id', 'Fallback Name');
    const state = harness.getState();

    expect(result.success).toBe(true);
    expect(result.report?.result).toBe('imported');
    expect(clearActiveRunSnapshot).toHaveBeenCalledTimes(1);
    expect(state.workflowId).toBe('wf_imported');
    expect(state.workflowName).toBe('Imported Flow');
    const groupData = (state.nodes.find((node) => node.id === 'group')?.data || {}) as {
      groupInputs?: unknown[];
    };
    expect(groupData.groupInputs?.[0]).toMatchObject({
      type: 'string',
      binding: { nodeId: 'inner', handleId: 'prompt' },
    });
    expect(state.isExecuting).toBe(false);
    expect(state.currentRunId).toBeNull();
    expect(state.nodeExecStatus).toEqual({});
    expect(state.hasUnsavedChanges).toBe(true);
    expect(state.lastSavedAt).toBeNull();
    expect(persistLocalDraft).toHaveBeenCalledTimes(1);
  });
});
