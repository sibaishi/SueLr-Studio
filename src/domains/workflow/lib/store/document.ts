import * as api from '@/domains/workflow/lib/api/workflows';
import { DEFAULT_WORKFLOW_NAME } from '@/domains/workflow/lib/constants';
import { pruneGroupPortEdges } from '@/domains/workflow/lib/groupPorts';
import type {
  WorkflowImportError,
  WorkflowImportMode,
  WorkflowImportReport,
} from '@/domains/workflow/lib/persistenceTypes';
import { normalizeEditorNodes } from '@/domains/workflow/lib/store/editorShared';
import { buildWorkflowPayload, gid, normalizeEdges, normalizeNodes } from '@/domains/workflow/lib/store/helpers';
import { clearActiveRunSnapshot, type loadLocalDraft } from '@/domains/workflow/lib/store/persistence';
import type {
  WorkflowImportResult,
  WorkflowState,
  WorkflowStoreGet,
  WorkflowStoreSet,
} from '@/domains/workflow/lib/store/types';
import type { Workflow } from '@/domains/workflow/lib/types';

type WorkflowStoreDocumentActions = Pick<
  WorkflowState,
  | 'saveWorkflow'
  | 'loadWorkflow'
  | 'loadWorkflowDetailed'
  | 'fetchWorkflowList'
  | 'initializeWorkflowPersistence'
  | 'duplicateCurrentWorkflow'
  | 'duplicateCurrentWorkflowDetailed'
  | 'deleteCurrentWorkflow'
  | 'deleteCurrentWorkflowDetailed'
  | 'saveWorkflowDetailed'
  | 'exportCurrentWorkflow'
  | 'importWorkflowDataWithMode'
  | 'importWorkflowData'
>;

type DocumentActionDeps = {
  initialDraft: ReturnType<typeof loadLocalDraft>;
};

function getApiErrorMessage(result: { error?: string } | undefined, fallback: string) {
  const message = String(result?.error || '').trim();
  return message || fallback;
}

function getApiErrorStatus(result: { status?: number } | undefined) {
  return typeof result?.status === 'number' ? result.status : undefined;
}

function resetWorkflowRuntimeStatePatch() {
  return {
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
    nodeExecutionActiveCounts: {},
    nodeExecutionStartedCounts: {},
    nodeExecutionCompletedCounts: {},
    nodeExecutionExpectedCounts: {},
    nodeErrors: {},
    nodeWarnings: {},
    nodeOutputs: {},
    aiResultOutputs: {},
    executionLogs: [],
    workflowWarningMessage: null,
  } satisfies Partial<WorkflowState>;
}

export function createWorkflowDocumentActions(
  set: WorkflowStoreSet,
  get: WorkflowStoreGet,
  deps: DocumentActionDeps,
): WorkflowStoreDocumentActions {
  return {
    saveWorkflowDetailed: async () => {
      const state = get();
      set({ isSavingWorkflow: true });

      const workflowData = buildWorkflowPayload(state.workflowId, state.workflowName, state.nodes, state.edges);

      const updateResult = await api.updateWorkflow(state.workflowId, workflowData);
      if (updateResult.success) {
        await get().fetchWorkflowList();
        set({
          isSavingWorkflow: false,
          hasUnsavedChanges: false,
          lastSavedAt: Date.now(),
        });
        get().persistLocalDraft();
        return { success: true, data: { workflowId: state.workflowId } };
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
        return { success: true, data: { workflowId: savedId } };
      }

      set({ isSavingWorkflow: false });
      return {
        success: false,
        code: 'WORKFLOW_SAVE_FAILED',
        message: getApiErrorMessage(createResult, getApiErrorMessage(updateResult, '保存工作流失败')),
        status: getApiErrorStatus(createResult) ?? getApiErrorStatus(updateResult),
      };
    },

    saveWorkflow: async () => {
      const result = await get().saveWorkflowDetailed();
      return result.success;
    },

    loadWorkflowDetailed: async (id) => {
      clearActiveRunSnapshot();
      const result = await api.fetchWorkflow(id);
      if (!result.success || !result.data) {
        return {
          success: false,
          code: 'WORKFLOW_LOAD_FAILED',
          message: getApiErrorMessage(result, '加载工作流失败'),
          status: getApiErrorStatus(result),
        };
      }

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
        ...resetWorkflowRuntimeStatePatch(),
        hasUnsavedChanges: false,
        lastSavedAt: typeof workflow.updatedAt === 'number' ? workflow.updatedAt : Date.now(),
      });

      get().persistLocalDraft();
      return { success: true, data: { workflowId: id } };
    },

    loadWorkflow: async (id) => {
      const result = await get().loadWorkflowDetailed(id);
      return result.success;
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

    duplicateCurrentWorkflowDetailed: async () => {
      const state = get();
      const existsInList = state.workflowList.some((workflow) => workflow.id === state.workflowId);

      if (!existsInList) {
        const result = await api.createWorkflow({
          ...buildWorkflowPayload(`wf_${Date.now()}`, `${state.workflowName} (副本)`, state.nodes, state.edges),
        });

        if (!result.success || !result.data) {
          return {
            success: false,
            code: 'WORKFLOW_DUPLICATE_FAILED',
            message: getApiErrorMessage(result, '复制工作流失败'),
            status: getApiErrorStatus(result),
          };
        }

        const newId = (result.data as Workflow).id;
        await get().fetchWorkflowList();
        return get().loadWorkflowDetailed(newId);
      }

      const result = await api.duplicateWorkflow(state.workflowId);
      if (!result.success || !result.data) {
        return {
          success: false,
          code: 'WORKFLOW_DUPLICATE_FAILED',
          message: getApiErrorMessage(result, '复制工作流失败'),
          status: getApiErrorStatus(result),
        };
      }

      const newId = (result.data as Record<string, unknown>).id as string;
      await get().fetchWorkflowList();
      return get().loadWorkflowDetailed(newId);
    },

    duplicateCurrentWorkflow: async () => {
      const result = await get().duplicateCurrentWorkflowDetailed();
      return result.success;
    },

    deleteCurrentWorkflowDetailed: async () => {
      const state = get();
      const existsInList = state.workflowList.some((workflow) => workflow.id === state.workflowId);

      if (existsInList) {
        const result = await api.deleteWorkflow(state.workflowId);
        if (!result.success) {
          return {
            success: false,
            code: 'WORKFLOW_DELETE_FAILED',
            message: getApiErrorMessage(result, '删除工作流失败'),
            status: getApiErrorStatus(result),
          };
        }
      }

      await get().fetchWorkflowList();
      const nextWorkflow = get().workflowList[0];

      if (nextWorkflow) {
        return get().loadWorkflowDetailed(nextWorkflow.id);
      }

      get().newWorkflow();
      get().persistLocalDraft();
      return { success: true, data: {} };
    },

    deleteCurrentWorkflow: async () => {
      const result = await get().deleteCurrentWorkflowDetailed();
      return result.success;
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
          error: (importResult as { importError?: WorkflowImportError }).importError || {
            message: importResult.error || '导入失败',
          },
        };
      }

      const record = importResult.data as Workflow;
      const rawNodes = normalizeNodes(record.nodes);
      const normalizedEdges = normalizeEdges(record.edges, new Set(rawNodes.map((node) => node.id)));
      const normalizedNodes = normalizeEditorNodes(rawNodes, normalizedEdges);
      const edges = pruneGroupPortEdges(normalizedNodes, normalizedEdges);
      const nodes = normalizeEditorNodes(rawNodes, edges);
      const importedName = typeof record.name === 'string' ? record.name : fallbackName || DEFAULT_WORKFLOW_NAME;

      clearActiveRunSnapshot();
      set({
        workflowId: typeof record.id === 'string' ? record.id : gid(),
        workflowName: importedName,
        nodes,
        edges,
        ...resetWorkflowRuntimeStatePatch(),
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
      return get().importWorkflowDataWithMode(
        payload,
        'generate_new_id' satisfies WorkflowImportMode,
        fallbackName,
      ) as Promise<WorkflowImportResult>;
    },
  };
}
