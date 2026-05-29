import * as api from '@/domains/workflow/lib/api/workflows';
import { DEFAULT_WORKFLOW_NAME } from '@/domains/workflow/lib/constants';
import { pruneGroupPortEdges } from '@/domains/workflow/lib/groupPorts';
import type {
  WorkflowImportError,
  WorkflowImportMode,
  WorkflowImportReport,
} from '@/domains/workflow/lib/persistenceTypes';
import {
  createEmptyRuntimePatch,
  getDocumentViewPatch,
  patchActiveWorkflowDocument,
} from '@/domains/workflow/lib/store/documents';
import { normalizeEditorNodes } from '@/domains/workflow/lib/store/editorShared';
import { buildWorkflowPayload, gid, normalizeEdges, normalizeNodes } from '@/domains/workflow/lib/store/helpers';
import { clearActiveRunSnapshot, type loadLocalDraft } from '@/domains/workflow/lib/store/persistence';
import type {
  WorkflowDocument,
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

function normalizeWorkflowGraph(workflow: Workflow) {
  const rawNodes = normalizeNodes(workflow.nodes);
  const normalizedEdges = normalizeEdges(workflow.edges, new Set(rawNodes.map((node) => node.id)));
  const normalizedNodes = normalizeEditorNodes(rawNodes, normalizedEdges);
  const edges = pruneGroupPortEdges(normalizedNodes, normalizedEdges);
  const nodes = normalizeEditorNodes(rawNodes, edges);
  return { nodes, edges };
}

function createDocumentFromWorkflow(
  workflow: Workflow,
  options: {
    documentId: string;
    sourceWorkflowId?: string;
    origin: WorkflowDocument['origin'];
    hasUnsavedChanges: boolean;
    lastSavedAt: number | null;
    fallbackName?: string;
  },
): WorkflowDocument {
  const { nodes, edges } = normalizeWorkflowGraph(workflow);
  return {
    documentId: options.documentId,
    workflowId: typeof workflow.id === 'string' ? workflow.id : gid(),
    sourceWorkflowId: options.sourceWorkflowId,
    name: typeof workflow.name === 'string' ? workflow.name : options.fallbackName || DEFAULT_WORKFLOW_NAME,
    nodes,
    edges,
    selectedNodeId: null,
    hasUnsavedChanges: options.hasUnsavedChanges,
    lastSavedAt: options.lastSavedAt,
    origin: options.origin,
    ...createEmptyRuntimePatch(),
  };
}

function bindActiveDocumentAfterSave(state: WorkflowState, workflow: Workflow) {
  const workflowId = typeof workflow.id === 'string' ? workflow.id : state.workflowId;
  const savedAt = typeof workflow.updatedAt === 'number' ? workflow.updatedAt : Date.now();
  return {
    documents: patchActiveWorkflowDocument(state, {
      workflowId,
      sourceWorkflowId: workflowId,
      name: state.workflowName,
      hasUnsavedChanges: false,
      lastSavedAt: savedAt,
      origin: 'saved',
    }),
    workflowId,
    isSavingWorkflow: false,
    hasUnsavedChanges: false,
    lastSavedAt: savedAt,
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
      const activeDocument = state.documents.find((document) => document.documentId === state.activeDocumentId);
      const targetWorkflowId = activeDocument?.sourceWorkflowId;
      const workflowData = buildWorkflowPayload(
        targetWorkflowId || state.workflowId || gid(),
        state.workflowName,
        state.nodes,
        state.edges,
      );

      set({ isSavingWorkflow: true });

      if (targetWorkflowId) {
        const updateResult = await api.updateWorkflow(targetWorkflowId, workflowData);
        if (!updateResult.success) {
          set({ isSavingWorkflow: false });
          return {
            success: false,
            code: 'WORKFLOW_SAVE_FAILED',
            message: getApiErrorMessage(updateResult, '保存工作流失败'),
            status: getApiErrorStatus(updateResult),
          };
        }

        await get().fetchWorkflowList();
        set(bindActiveDocumentAfterSave(get(), (updateResult.data || workflowData) as Workflow));
        get().persistLocalDraft();
        return { success: true, data: { workflowId: targetWorkflowId } };
      }

      const createResult = await api.createWorkflow({ ...workflowData, id: workflowData.id || gid() });
      if (!createResult.success || !createResult.data) {
        set({ isSavingWorkflow: false });
        return {
          success: false,
          code: 'WORKFLOW_SAVE_FAILED',
          message: getApiErrorMessage(createResult, '保存工作流失败'),
          status: getApiErrorStatus(createResult),
        };
      }

      const savedWorkflow = createResult.data as Workflow;
      await get().fetchWorkflowList();
      set(bindActiveDocumentAfterSave(get(), savedWorkflow));
      get().persistLocalDraft();
      return { success: true, data: { workflowId: savedWorkflow.id } };
    },

    saveWorkflow: async () => {
      const result = await get().saveWorkflowDetailed();
      return result.success;
    },

    loadWorkflowDetailed: async (id) => {
      clearActiveRunSnapshot();

      const alreadyOpen = get().documents.find((document) => document.sourceWorkflowId === id);
      if (alreadyOpen) {
        get().setActiveWorkflowDocument(alreadyOpen.documentId);
        return { success: true, data: { workflowId: id } };
      }

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
      const document = createDocumentFromWorkflow(workflow, {
        documentId: gid(),
        sourceWorkflowId: id,
        origin: 'saved',
        hasUnsavedChanges: false,
        lastSavedAt: typeof workflow.updatedAt === 'number' ? workflow.updatedAt : Date.now(),
      });

      set({
        documents: [...patchActiveWorkflowDocument(get()), document],
        ...getDocumentViewPatch(document),
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
      const result = await api.createWorkflow(
        buildWorkflowPayload(gid(), `${state.workflowName} (副本)`, state.nodes, state.edges),
      );
      if (!result.success || !result.data) {
        return {
          success: false,
          code: 'WORKFLOW_DUPLICATE_FAILED',
          message: getApiErrorMessage(result, '复制工作流失败'),
          status: getApiErrorStatus(result),
        };
      }

      const savedWorkflow = result.data as Workflow;
      await get().fetchWorkflowList();
      set({
        ...bindActiveDocumentAfterSave(get(), savedWorkflow),
        workflowName: typeof savedWorkflow.name === 'string' ? savedWorkflow.name : `${state.workflowName} (副本)`,
      });
      get().persistLocalDraft();
      return { success: true, data: { workflowId: savedWorkflow.id } };
    },

    duplicateCurrentWorkflow: async () => {
      const result = await get().duplicateCurrentWorkflowDetailed();
      return result.success;
    },

    deleteCurrentWorkflowDetailed: async () => {
      const state = get();
      const activeDocument = state.documents.find((document) => document.documentId === state.activeDocumentId);
      const sourceWorkflowId = activeDocument?.sourceWorkflowId;
      const existsInList = Boolean(
        sourceWorkflowId && state.workflowList.some((workflow) => workflow.id === sourceWorkflowId),
      );

      if (sourceWorkflowId && existsInList) {
        const result = await api.deleteWorkflow(sourceWorkflowId);
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

      if (sourceWorkflowId) {
        const latest = get();
        const documents = patchActiveWorkflowDocument(latest).map((document) =>
          document.sourceWorkflowId === sourceWorkflowId
            ? {
                ...document,
                workflowId: gid(),
                sourceWorkflowId: undefined,
                origin: 'new' as const,
                hasUnsavedChanges: true,
                lastSavedAt: null,
              }
            : document,
        );
        const active = documents.find((document) => document.documentId === latest.activeDocumentId) || documents[0];
        set({
          documents,
          ...getDocumentViewPatch(active),
        });
      }

      get().persistLocalDraft();
      return { success: true, data: { workflowId: sourceWorkflowId } };
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

      const importResult =
        mode === 'generate_new_id'
          ? await api.importWorkflowDraft(payload as Record<string, unknown>)
          : await api.importWorkflow(payload as Record<string, unknown>, mode);
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
      const importedName = fallbackName || (typeof record.name === 'string' ? record.name : DEFAULT_WORKFLOW_NAME);
      const document = createDocumentFromWorkflow(
        { ...record, id: typeof record.id === 'string' ? record.id : gid(), name: importedName },
        {
          documentId: gid(),
          origin: 'imported',
          hasUnsavedChanges: true,
          lastSavedAt: null,
          fallbackName,
        },
      );

      clearActiveRunSnapshot();
      set({
        documents: [...patchActiveWorkflowDocument(get()), document],
        ...getDocumentViewPatch(document),
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
