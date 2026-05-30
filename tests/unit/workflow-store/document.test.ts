import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PersistedWorkflow, WorkflowImportReport } from '@/domains/workflow/lib/persistenceTypes';
import { DEFAULT_WORKFLOW_NAME } from '@/domains/workflow/lib/constants';
import { createWorkflowDocumentActions } from '@/domains/workflow/lib/store/document';
import { createWorkflowDocumentTabActions } from '@/domains/workflow/lib/store/documents';
import { createWorkflowEditorSessionActions } from '@/domains/workflow/lib/store/editorSession';
import { createBaseWorkflowState, createWorkflowStoreHarness } from './testHarness';

vi.mock('@/domains/workflow/lib/api/workflows', () => ({
  updateWorkflow: vi.fn(),
  createWorkflow: vi.fn(),
  fetchWorkflow: vi.fn(),
  fetchWorkflows: vi.fn(),
  duplicateWorkflow: vi.fn(),
  deleteWorkflow: vi.fn(),
  importWorkflow: vi.fn(),
  importWorkflowDraft: vi.fn(),
}));

vi.mock('@/domains/workflow/lib/store/persistence', () => ({
  clearActiveRunSnapshot: vi.fn(),
  loadLocalDraft: vi.fn(() => null),
  saveLocalDraft: vi.fn(),
}));

import * as api from '@/domains/workflow/lib/api/workflows';
import { clearActiveRunSnapshot, saveLocalDraft } from '@/domains/workflow/lib/store/persistence';

function attachDocumentActions(harness: ReturnType<typeof createWorkflowStoreHarness>) {
  const actions = createWorkflowDocumentActions(harness.set, harness.get, { initialDraft: null });
  harness.attachActions({
    ...actions,
    ...createWorkflowDocumentTabActions(harness.set, harness.get),
    ...createWorkflowEditorSessionActions(harness.set, harness.get),
  });
  return actions;
}

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

    const actions = attachDocumentActions(harness);

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
    expect(saveLocalDraft).toHaveBeenCalledTimes(1);
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
    const actions = attachDocumentActions(harness);

    await actions.initializeWorkflowPersistence();

    const state = harness.getState();
    expect(api.fetchWorkflows).toHaveBeenCalledTimes(1);
    expect(api.fetchWorkflow).toHaveBeenCalledWith('wf_first');
    expect(state.isHydratingWorkflow).toBe(false);
    expect(state.workflowList).toHaveLength(1);
    expect(state.workflowId).toBe('wf_first');
    expect(saveLocalDraft).toHaveBeenCalled();
  });

  it('imports workflow data, resets runtime state, and marks the draft dirty', async () => {
    vi.mocked(api.importWorkflowDraft).mockResolvedValue({
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
    const actions = attachDocumentActions(harness);

    const result = await actions.importWorkflowDataWithMode({ id: 'incoming' }, 'generate_new_id', 'Fallback Name');
    const state = harness.getState();

    expect(result.success).toBe(true);
    expect(api.importWorkflowDraft).toHaveBeenCalledTimes(1);
    expect(api.importWorkflow).not.toHaveBeenCalled();
    expect(result.report?.result).toBe('imported');
    expect(clearActiveRunSnapshot).toHaveBeenCalledTimes(1);
    expect(state.workflowId).toBe('wf_imported');
    expect(state.workflowName).toBe('Fallback Name');
    expect(state.documents).toHaveLength(2);
    expect(state.documents.find((document) => document.documentId === state.activeDocumentId)).toMatchObject({
      workflowId: 'wf_imported',
      sourceWorkflowId: undefined,
      origin: 'imported',
      hasUnsavedChanges: true,
    });
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
    expect(saveLocalDraft).toHaveBeenCalledTimes(1);
  });

  it('opens the same saved workflow only once and switches to the existing document', async () => {
    vi.mocked(api.fetchWorkflow).mockResolvedValue({
      success: true,
      data: createPersistedWorkflow({ id: 'wf_saved', name: 'Saved Workflow' }),
    });

    const harness = createWorkflowStoreHarness({
      workflowList: [{ id: 'wf_saved', name: 'Saved Workflow', nodeCount: 0, updatedAt: 1 }],
    });
    const actions = attachDocumentActions(harness);

    await actions.loadWorkflowDetailed('wf_saved');
    const firstDocumentId = harness.getState().activeDocumentId;
    harness.getState().newWorkflow();
    await actions.loadWorkflowDetailed('wf_saved');

    expect(api.fetchWorkflow).toHaveBeenCalledTimes(1);
    expect(harness.getState().activeDocumentId).toBe(firstDocumentId);
    expect(harness.getState().documents.filter((document) => document.sourceWorkflowId === 'wf_saved')).toHaveLength(1);
  });

  it('keeps open document content independent when switching tabs', async () => {
    vi.mocked(api.fetchWorkflow).mockResolvedValue({
      success: true,
      data: createPersistedWorkflow({
        id: 'wf_saved',
        name: 'Saved Workflow',
        nodes: [{ id: 'saved_node', type: 'textInput', position: { x: 0, y: 0 }, data: {} }],
      }),
    });

    const harness = createWorkflowStoreHarness();
    const actions = attachDocumentActions(harness);
    harness.getState().newWorkflow();
    const draftDocumentId = harness.getState().activeDocumentId;
    harness.set({
      workflowName: 'Draft A',
      nodes: [{ id: 'draft_node', type: 'textInput', position: { x: 1, y: 1 }, data: {} }],
      hasUnsavedChanges: true,
    });

    await actions.loadWorkflowDetailed('wf_saved');
    expect(harness.getState().nodes.map((node) => node.id)).toEqual(['saved_node']);

    harness.getState().setActiveWorkflowDocument(draftDocumentId);
    expect(harness.getState().workflowName).toBe('Draft A');
    expect(harness.getState().nodes.map((node) => node.id)).toEqual(['draft_node']);
    expect(harness.getState().hasUnsavedChanges).toBe(true);
  });

  it('replaces the last closed document with a single empty draft tab', async () => {
    const persistLocalDraft = vi.fn();
    const harness = createWorkflowStoreHarness({
      workflowId: 'wf_last',
      workflowName: 'Last Workflow',
      nodes: [{ id: 'last_node', type: 'textInput', position: { x: 0, y: 0 }, data: {} }],
      hasUnsavedChanges: false,
      documents: [
        {
          ...createBaseWorkflowState().documents[0],
          documentId: 'doc_last',
          workflowId: 'wf_last',
          sourceWorkflowId: 'wf_last',
          name: 'Last Workflow',
          nodes: [{ id: 'last_node', type: 'textInput', position: { x: 0, y: 0 }, data: {} }],
          origin: 'saved',
        },
      ],
      activeDocumentId: 'doc_last',
      persistLocalDraft,
    });
    attachDocumentActions(harness);

    const result = await harness.getState().closeWorkflowDocument('doc_last');
    const state = harness.getState();

    expect(result).toBe(true);
    expect(state.documents).toHaveLength(1);
    expect(state.documents[0].documentId).not.toBe('doc_last');
    expect(state.documents[0]).toMatchObject({
      name: DEFAULT_WORKFLOW_NAME,
      nodes: [],
      edges: [],
      hasUnsavedChanges: false,
      origin: 'new',
    });
    expect(state.activeDocumentId).toBe(state.documents[0].documentId);
    expect(state.nodes).toEqual([]);
    expect(state.workflowName).toBe(DEFAULT_WORKFLOW_NAME);
    expect(saveLocalDraft).toHaveBeenCalledTimes(1);
  });

  it('saves imported document by creating a new workflow and binding the tab to the new id', async () => {
    vi.mocked(api.importWorkflowDraft).mockResolvedValue({
      success: true,
      data: createPersistedWorkflow({ id: 'wf_draft_import', name: 'Imported Draft' }),
      report: createWorkflowImportReport(),
    });
    vi.mocked(api.createWorkflow).mockResolvedValue({
      success: true,
      data: createPersistedWorkflow({ id: 'wf_created_import', name: 'Imported Draft', updatedAt: 300 }),
    });
    vi.mocked(api.fetchWorkflows).mockResolvedValue({
      success: true,
      data: [{ id: 'wf_created_import', name: 'Imported Draft', nodeCount: 0, updatedAt: 300 }],
    });

    const harness = createWorkflowStoreHarness();
    const actions = attachDocumentActions(harness);

    await actions.importWorkflowData({ id: 'old_id', name: 'Imported Draft', nodes: [], edges: [] });
    await actions.saveWorkflowDetailed();

    const active = harness.getState().documents.find((document) => document.documentId === harness.getState().activeDocumentId);
    expect(api.updateWorkflow).not.toHaveBeenCalled();
    expect(api.createWorkflow).toHaveBeenCalledTimes(1);
    expect(active).toMatchObject({
      workflowId: 'wf_created_import',
      sourceWorkflowId: 'wf_created_import',
      origin: 'saved',
      hasUnsavedChanges: false,
      lastSavedAt: 300,
    });
  });

  it('closes the active saved document after deleting its library record', async () => {
    vi.mocked(api.deleteWorkflow).mockResolvedValue({ success: true });
    vi.mocked(api.fetchWorkflows).mockResolvedValue({ success: true, data: [] });

    const harness = createWorkflowStoreHarness({
      workflowId: 'wf_saved',
      workflowName: 'Saved Workflow',
      workflowList: [{ id: 'wf_saved', name: 'Saved Workflow', nodeCount: 0, updatedAt: 1 }],
      documents: [
        {
          ...createBaseWorkflowState().documents[0],
          documentId: 'doc_saved',
          workflowId: 'wf_saved',
          sourceWorkflowId: 'wf_saved',
          name: 'Saved Workflow',
          origin: 'saved',
        },
        {
          ...createBaseWorkflowState().documents[0],
          documentId: 'doc_other',
          workflowId: 'wf_other',
          sourceWorkflowId: undefined,
          name: 'Other Draft',
          origin: 'new',
        },
      ],
      activeDocumentId: 'doc_saved',
    });
    const actions = attachDocumentActions(harness);

    await actions.deleteCurrentWorkflowDetailed();

    expect(api.deleteWorkflow).toHaveBeenCalledWith('wf_saved');
    expect(harness.getState().documents.map((document) => document.documentId)).toEqual(['doc_other']);
    expect(harness.getState().activeDocumentId).toBe('doc_other');
    expect(harness.getState().workflowList).toEqual([]);
  });

  it('creates a workflow when saving an unsaved draft', async () => {
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
      documents: [
        {
          ...createBaseWorkflowState().documents[0],
          documentId: 'doc_draft',
          workflowId: 'wf_local',
          sourceWorkflowId: undefined,
          name: 'Saved Workflow',
          origin: 'new',
          hasUnsavedChanges: true,
        },
      ],
      activeDocumentId: 'doc_draft',
      persistLocalDraft,
    });
    const actions = attachDocumentActions(harness);

    const result = await actions.saveWorkflow();
    const state = harness.getState();

    expect(result).toBe(true);
    expect(api.updateWorkflow).not.toHaveBeenCalled();
    expect(api.createWorkflow).toHaveBeenCalledTimes(1);
    expect(state.workflowId).toBe('wf_created_from_save');
    expect(state.isSavingWorkflow).toBe(false);
    expect(state.hasUnsavedChanges).toBe(false);
    expect(state.lastSavedAt).toEqual(expect.any(Number));
    expect(saveLocalDraft).toHaveBeenCalledTimes(1);
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
    const actions = attachDocumentActions(harness);

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
    const actions = attachDocumentActions(harness);

    const result = await actions.saveWorkflowDetailed();

    expect(result).toEqual({
      success: false,
      code: 'WORKFLOW_SAVE_FAILED',
      message: 'update failed',
      status: 404,
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
    const actions = attachDocumentActions(harness);

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
    const actions = attachDocumentActions(harness);

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
