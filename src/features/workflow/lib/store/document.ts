import { DEFAULT_WORKFLOW_NAME } from '@/features/workflow/lib/constants';
import * as api from '@/features/workflow/lib/api';
import type { Workflow } from '@/features/workflow/lib/types';
import type { WorkflowImportError, WorkflowImportMode, WorkflowImportReport } from '@/features/workflow/lib/persistenceTypes';
import { clearActiveRunSnapshot, loadLocalDraft } from '@/features/workflow/lib/store/persistence';
import { pruneGroupPortEdges } from '@/features/workflow/lib/groupPorts';
import { normalizeEditorNodes } from '@/features/workflow/lib/store/editorShared';
import { buildWorkflowPayload, gid, normalizeEdges, normalizeNodes } from '@/features/workflow/lib/store/helpers';
import type { WorkflowImportResult, WorkflowState, WorkflowStoreGet, WorkflowStoreSet } from '@/features/workflow/lib/store/types';

type WorkflowStoreDocumentActions = Pick<
  WorkflowState,
  | 'saveWorkflow'
  | 'loadWorkflow'
  | 'fetchWorkflowList'
  | 'initializeWorkflowPersistence'
  | 'duplicateCurrentWorkflow'
  | 'deleteCurrentWorkflow'
  | 'exportCurrentWorkflow'
  | 'importWorkflowDataWithMode'
  | 'importWorkflowData'
>;

type DocumentActionDeps = {
  initialDraft: ReturnType<typeof loadLocalDraft>;
};

export function createWorkflowDocumentActions(
  set: WorkflowStoreSet,
  get: WorkflowStoreGet,
  deps: DocumentActionDeps,
): WorkflowStoreDocumentActions {
  return {
    saveWorkflow: async () => {
      const state = get();
      set({ isSavingWorkflow: true });

      const workflowData = buildWorkflowPayload(
        state.workflowId,
        state.workflowName,
        state.nodes,
        state.edges,
      );

      const updateResult = await api.updateWorkflow(state.workflowId, workflowData);
      if (updateResult.success) {
        await get().fetchWorkflowList();
        set({
          isSavingWorkflow: false,
          hasUnsavedChanges: false,
          lastSavedAt: Date.now(),
        });
        get().persistLocalDraft();
        return true;
      }

      const createResult = await api.createWorkflow(workflowData);
      if (createResult.success && createResult.data) {
        const savedWorkflow = createResult.data as Workflow;
        const savedId = typeof savedWorkflow.id === 'string' ? savedWorkflow.id : state.workflowId;

        set({
          workflowId: savedId,
          isSavingWorkflow: false,
          hasUnsavedChanges: false,
          lastSavedAt: Date.now(),
        });
        await get().fetchWorkflowList();
        get().persistLocalDraft();
        return true;
      }

      set({ isSavingWorkflow: false });
      return false;
    },

    loadWorkflow: async (id) => {
      clearActiveRunSnapshot();
      const result = await api.fetchWorkflow(id);
      if (!result.success || !result.data) return false;

      const workflow = result.data as Workflow;
      const rawNodes = normalizeNodes(workflow.nodes);
      const normalizedEdges = normalizeEdges(workflow.edges, new Set(rawNodes.map((node) => node.id)));
      const normalizedNodes = normalizeEditorNodes(rawNodes, normalizedEdges);
      const edges = pruneGroupPortEdges(normalizedNodes, normalizedEdges);
      const nodes = normalizeEditorNodes(rawNodes, edges);

      set({
        workflowId: id,
        workflowName: typeof workflow.name === 'string' ? workflow.name : DEFAULT_WORKFLOW_NAME,
        nodes,
        edges,
        selectedNodeId: null,
        isExecuting: false,
        executionProgress: null,
        executionMessage: null,
        currentRunId: null,
        executingNodeId: null,
        lastExecutionStatus: null,
        lastExecutionTime: null,
        lastExecutionError: null,
        lastExecutionSummary: null,
        nodeExecStatus: {},
        nodeExecutionTime: {},
        nodeExecutionStartedAt: {},
        nodeErrors: {},
        nodeWarnings: {},
        nodeOutputs: {},
        aiResultOutputs: {},
        executionLogs: [],
        workflowWarningMessage: null,
        hasUnsavedChanges: false,
        lastSavedAt: typeof workflow.updatedAt === 'number' ? workflow.updatedAt : Date.now(),
      });

      get().persistLocalDraft();
      return true;
    },

    fetchWorkflowList: async () => {
      const result = await api.fetchWorkflows();
      if (result.success && result.data) {
        set({ workflowList: result.data });
      }
    },

    initializeWorkflowPersistence: async () => {
      set({ isHydratingWorkflow: true });
      await get().fetchWorkflowList();

      const workflowList = get().workflowList;
      if (!deps.initialDraft && workflowList.length > 0) {
        await get().loadWorkflow(workflowList[0].id);
      }

      set({ isHydratingWorkflow: false });
    },

    duplicateCurrentWorkflow: async () => {
      const state = get();
      const existsInList = state.workflowList.some((workflow) => workflow.id === state.workflowId);

      if (!existsInList) {
        const result = await api.createWorkflow({
          ...buildWorkflowPayload(
            `wf_${Date.now()}`,
            `${state.workflowName} (副本)`,
            state.nodes,
            state.edges,
          ),
        });

        if (!result.success || !result.data) return false;

        const newId = (result.data as Workflow).id;
        await get().fetchWorkflowList();
        return get().loadWorkflow(newId);
      }

      const result = await api.duplicateWorkflow(state.workflowId);
      if (!result.success || !result.data) return false;

      const newId = (result.data as Record<string, unknown>).id as string;
      await get().fetchWorkflowList();
      return get().loadWorkflow(newId);
    },

    deleteCurrentWorkflow: async () => {
      const state = get();
      const existsInList = state.workflowList.some((workflow) => workflow.id === state.workflowId);

      if (existsInList) {
        const result = await api.deleteWorkflow(state.workflowId);
        if (!result.success) return false;
      }

      await get().fetchWorkflowList();
      const nextWorkflow = get().workflowList[0];

      if (nextWorkflow) {
        return get().loadWorkflow(nextWorkflow.id);
      }

      get().newWorkflow();
      get().persistLocalDraft();
      return true;
    },

    exportCurrentWorkflow: () => {
      const state = get();
      return buildWorkflowPayload(state.workflowId, state.workflowName, state.nodes, state.edges);
    },

    importWorkflowDataWithMode: async (payload, mode, fallbackName) => {
      if (!payload || typeof payload !== 'object') {
        return { success: false, report: null, error: { message: '导入失败：文件格式不正确。' } };
      }

      const importResult = await api.importWorkflow(payload as Record<string, unknown>, mode);
      if (!importResult.success || !importResult.data) {
        return {
          success: false,
          report: null,
          error: (importResult as { importError?: WorkflowImportError }).importError || { message: importResult.error || '导入失败' },
        };
      }

      const record = importResult.data as Workflow;
      const rawNodes = normalizeNodes(record.nodes);
      const normalizedEdges = normalizeEdges(record.edges, new Set(rawNodes.map((node) => node.id)));
      const normalizedNodes = normalizeEditorNodes(rawNodes, normalizedEdges);
      const edges = pruneGroupPortEdges(normalizedNodes, normalizedEdges);
      const nodes = normalizeEditorNodes(rawNodes, edges);
      const importedName = typeof record.name === 'string'
        ? record.name
        : fallbackName || DEFAULT_WORKFLOW_NAME;

      clearActiveRunSnapshot();
      set({
        workflowId: typeof record.id === 'string' ? record.id : gid(),
        workflowName: importedName,
        nodes,
        edges,
        selectedNodeId: null,
        isExecuting: false,
        executionProgress: null,
        executionMessage: null,
        currentRunId: null,
        executingNodeId: null,
        lastExecutionStatus: null,
        lastExecutionTime: null,
        lastExecutionError: null,
        lastExecutionSummary: null,
        nodeExecStatus: {},
        nodeExecutionTime: {},
        nodeExecutionStartedAt: {},
        nodeErrors: {},
        nodeWarnings: {},
        nodeOutputs: {},
        aiResultOutputs: {},
        executionLogs: [],
        workflowWarningMessage: null,
        hasUnsavedChanges: true,
        lastSavedAt: null,
      });

      get().persistLocalDraft();
      return {
        success: true,
        report: (importResult as { report?: WorkflowImportReport }).report || null,
        error: null,
      };
    },

    importWorkflowData: async (payload, fallbackName) => {
      return get().importWorkflowDataWithMode(payload, 'generate_new_id' satisfies WorkflowImportMode, fallbackName) as Promise<WorkflowImportResult>;
    },
  };
}
