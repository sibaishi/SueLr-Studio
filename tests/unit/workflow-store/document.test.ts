import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PersistedWorkflow, WorkflowImportReport } from '@/domains/workflow/lib/persistenceTypes';
import { createWorkflowDocumentActions } from '@/domains/workflow/lib/store/document';
import { createWorkflowStoreHarness } from './testHarness';

vi.mock('@/domains/workflow/lib/api/workflows', () => ({
  updateWorkflow: vi.fn(),
  createWorkflow: vi.fn(),
  fetchWorkflow: vi.fn(),
  fetchWorkflows: vi.fn(),
  duplicateWorkflow: vi.fn(),
  deleteWorkflow: vi.fn(),
  importWorkflow: vi.fn(),
}));

vi.mock('@/domains/workflow/lib/store/persistence', () => ({
  clearActiveRunSnapshot: vi.fn(),
  loadLocalDraft: vi.fn(() => null),
}));

import * as api from '@/domains/workflow/lib/api/workflows';
import { clearActiveRunSnapshot } from '@/domains/workflow/lib/store/persistence';

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
      insideLinks: [{ nodeId: 'inner', handleId: 'prompt' }],
      outsideLinks: [{ nodeId: 'outside', handleId: 'text' }],
    });
    expect(groupData.groupOutputs?.[0]).toMatchObject({
      type: 'string',
      insideLinks: [{ nodeId: 'inner', handleId: 'response' }],
      outsideLinks: [{ nodeId: 'outside', handleId: 'text' }],
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
      insideLinks: [{ nodeId: 'inner', handleId: 'prompt' }],
      outsideLinks: [{ nodeId: 'outside', handleId: 'text' }],
    });
    expect(state.isExecuting).toBe(false);
    expect(state.currentRunId).toBeNull();
    expect(state.nodeExecStatus).toEqual({});
    expect(state.hasUnsavedChanges).toBe(true);
    expect(state.lastSavedAt).toBeNull();
    expect(persistLocalDraft).toHaveBeenCalledTimes(1);
  });

  it('falls back to creating a workflow when update fails during save', async () => {
    vi.mocked(api.updateWorkflow).mockResolvedValue({
      success: false,
      error: 'not found',
    });
    vi.mocked(api.createWorkflow).mockResolvedValue({
      success: true,
      data: createPersistedWorkflow({ id: 'wf_created_from_save', name: 'Saved Workflow' }),
    });
    vi.mocked(api.fetchWorkflows).mockResolvedValue({ success: true, data: [] });

    const persistLocalDraft = vi.fn();
    const harness = createWorkflowStoreHarness({
      workflowId: 'wf_local',
      workflowName: 'Saved Workflow',
      hasUnsavedChanges: true,
      persistLocalDraft,
    });
    const actions = createWorkflowDocumentActions(harness.set, harness.get, { initialDraft: null });
    harness.attachActions(actions);

    const result = await actions.saveWorkflow();
    const state = harness.getState();

    expect(result).toBe(true);
    expect(api.updateWorkflow).toHaveBeenCalledTimes(1);
    expect(api.createWorkflow).toHaveBeenCalledTimes(1);
    expect(state.workflowId).toBe('wf_created_from_save');
    expect(state.isSavingWorkflow).toBe(false);
    expect(state.hasUnsavedChanges).toBe(false);
    expect(state.lastSavedAt).toEqual(expect.any(Number));
    expect(persistLocalDraft).toHaveBeenCalledTimes(1);
  });

  it('returns false and clears saving state when save update and create both fail', async () => {
    vi.mocked(api.updateWorkflow).mockResolvedValue({
      success: false,
      error: 'update failed',
    });
    vi.mocked(api.createWorkflow).mockResolvedValue({
      success: false,
      error: 'create failed',
    });

    const persistLocalDraft = vi.fn();
    const harness = createWorkflowStoreHarness({
      hasUnsavedChanges: true,
      persistLocalDraft,
    });
    const actions = createWorkflowDocumentActions(harness.set, harness.get, { initialDraft: null });
    harness.attachActions(actions);

    const result = await actions.saveWorkflow();
    const state = harness.getState();

    expect(result).toBe(false);
    expect(state.isSavingWorkflow).toBe(false);
    expect(state.hasUnsavedChanges).toBe(true);
    expect(persistLocalDraft).not.toHaveBeenCalled();
  });

  it('returns structured save failure details from the detailed save action', async () => {
    vi.mocked(api.updateWorkflow).mockResolvedValue({
      success: false,
      error: 'update failed',
      status: 404,
    });
    vi.mocked(api.createWorkflow).mockResolvedValue({
      success: false,
      error: 'create failed',
      status: 500,
    });

    const harness = createWorkflowStoreHarness({ hasUnsavedChanges: true });
    const actions = createWorkflowDocumentActions(harness.set, harness.get, { initialDraft: null });
    harness.attachActions(actions);

    const result = await actions.saveWorkflowDetailed();

    expect(result).toEqual({
      success: false,
      code: 'WORKFLOW_SAVE_FAILED',
      message: 'create failed',
      status: 500,
    });
    expect(harness.getState().isSavingWorkflow).toBe(false);
  });

  it('returns structured load failure details from the detailed load action', async () => {
    vi.mocked(api.fetchWorkflow).mockResolvedValue({
      success: false,
      error: 'workflow missing',
      status: 404,
    });

    const harness = createWorkflowStoreHarness({
      workflowId: 'wf_current',
      workflowName: 'Current Workflow',
    });
    const actions = createWorkflowDocumentActions(harness.set, harness.get, { initialDraft: null });
    harness.attachActions(actions);

    const result = await actions.loadWorkflowDetailed('wf_missing');

    expect(result).toEqual({
      success: false,
      code: 'WORKFLOW_LOAD_FAILED',
      message: 'workflow missing',
      status: 404,
    });
    expect(harness.getState().workflowId).toBe('wf_current');
  });

  it('returns import conflict details without mutating the current workflow', async () => {
    vi.mocked(api.importWorkflow).mockResolvedValue({
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

    const persistLocalDraft = vi.fn();
    const harness = createWorkflowStoreHarness({
      workflowId: 'wf_current',
      workflowName: 'Current Workflow',
      persistLocalDraft,
    });
    const actions = createWorkflowDocumentActions(harness.set, harness.get, { initialDraft: null });
    harness.attachActions(actions);

    const result = await actions.importWorkflowDataWithMode({ id: 'wf_conflict' }, 'preserve_id');
    const state = harness.getState();

    expect(result).toEqual({
      success: false,
      report: null,
      error: {
        code: 'WORKFLOW_IMPORT_CONFLICT',
        message: 'Workflow already exists',
        details: {
          workflowId: 'wf_conflict',
          suggestedModes: ['overwrite', 'generate_new_id'],
        },
      },
    });
    expect(state.workflowId).toBe('wf_current');
    expect(state.workflowName).toBe('Current Workflow');
    expect(persistLocalDraft).not.toHaveBeenCalled();
  });
});
