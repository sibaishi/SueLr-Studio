import { DEFAULT_WORKFLOW_NAME } from '@/domains/workflow/lib/constants';
import * as api from '@/domains/workflow/lib/api';
import { pruneGroupPortEdges } from '@/domains/workflow/lib/groupPorts';
import { groupConfiguredProjectModels, normalizeProjectModels } from '@/domains/workflow/lib/projectModels';
import { normalizeEditorNodes } from '@/domains/workflow/lib/store/editorShared';
import { normalizeEdges, normalizeNodes } from '@/domains/workflow/lib/store/helpers';
import { clearActiveRunSnapshot, saveLocalDraft } from '@/domains/workflow/lib/store/persistence';
import { formatLogDetails, gid, sanitizeLogMessage } from '@/domains/workflow/lib/store/helpers';
import type { WorkflowEditorSnapshot, WorkflowState, WorkflowStoreGet, WorkflowStoreSet } from '@/domains/workflow/lib/store/types';

type WorkflowStoreEditorSessionActions = Pick<
  WorkflowState,
  | 'setNodeExecStatus'
  | 'clearAllExecStatus'
  | 'setExecuting'
  | 'setExecutionResult'
  | 'addExecutionLog'
  | 'clearExecutionLogs'
  | 'applyEditorSnapshot'
  | 'newWorkflow'
  | 'fetchModels'
  | 'setAvailableModels'
  | 'setProjectModels'
  | 'persistLocalDraft'
>;

export function createWorkflowEditorSessionActions(
  set: WorkflowStoreSet,
  get: WorkflowStoreGet,
): WorkflowStoreEditorSessionActions {
  return {
    setNodeExecStatus: (nodeId, status, error) => {
      set((state) => ({
        nodeExecStatus: { ...state.nodeExecStatus, [nodeId]: status },
        nodeExecutionStartedAt: status === 'running'
          ? { ...state.nodeExecutionStartedAt, [nodeId]: Date.now() }
          : state.nodeExecutionStartedAt,
        nodeExecutionActiveCounts: status === 'running'
          ? { ...state.nodeExecutionActiveCounts, [nodeId]: 1 }
          : state.nodeExecutionActiveCounts,
        nodeExecutionStartedCounts: status === 'running'
          ? { ...state.nodeExecutionStartedCounts, [nodeId]: 1 }
          : state.nodeExecutionStartedCounts,
        nodeExecutionExpectedCounts: status === 'running'
          ? { ...state.nodeExecutionExpectedCounts, [nodeId]: 1 }
          : state.nodeExecutionExpectedCounts,
        nodeErrors: error ? { ...state.nodeErrors, [nodeId]: error } : state.nodeErrors,
      }));
    },

    clearAllExecStatus: () => set({
      nodeExecStatus: {},
      nodeExecutionTime: {},
      nodeExecutionStartedAt: {},
      nodeExecutionActiveCounts: {},
      nodeExecutionStartedCounts: {},
      nodeExecutionCompletedCounts: {},
      nodeExecutionExpectedCounts: {},
      nodeErrors: {},
      nodeWarnings: {},
      workflowWarningMessage: null,
    }),

    setExecuting: (executing, progress) => {
      set({
        isExecuting: executing,
        executionProgress: progress || null,
        executionMessage: executing ? '准备执行工作流...' : null,
        currentRunId: executing ? get().currentRunId : null,
        executingNodeId: executing ? get().executingNodeId : null,
      });
    },

    setExecutionResult: (status, time, error) => {
      clearActiveRunSnapshot();
      set({
        isExecuting: false,
        executionProgress: null,
        executionMessage: null,
        currentRunId: null,
        executingNodeId: null,
        lastExecutionStatus: status,
        lastExecutionTime: time ?? null,
        lastExecutionError: error ?? null,
      });
    },

    addExecutionLog: (log) => {
      set((state) => ({
        executionLogs: [
          ...state.executionLogs.slice(-299),
          {
            id: `log_${gid()}`,
            timestamp: Date.now(),
            ...log,
            message: sanitizeLogMessage(log.message),
            details: formatLogDetails(log.details),
          },
        ],
      }));
    },

    clearExecutionLogs: () => set({ executionLogs: [] }),

    applyEditorSnapshot: (snapshot: WorkflowEditorSnapshot, markDirty = true) => {
      clearActiveRunSnapshot();
      const rawNodes = normalizeNodes(snapshot.nodes);
      const normalizedEdges = normalizeEdges(snapshot.edges, new Set(rawNodes.map((node) => node.id)));
      const normalizedNodes = normalizeEditorNodes(rawNodes, normalizedEdges);
      const edges = pruneGroupPortEdges(normalizedNodes, normalizedEdges);
      const nodes = normalizeEditorNodes(rawNodes, edges);
      set({
        workflowId: snapshot.workflowId,
        workflowName: snapshot.workflowName,
        nodes,
        edges,
        selectedNodeId: snapshot.selectedNodeId,
        hasUnsavedChanges: markDirty,
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
      });
    },

    newWorkflow: () => {
      clearActiveRunSnapshot();
      set({
        workflowId: gid(),
        workflowName: DEFAULT_WORKFLOW_NAME,
        nodes: [],
        edges: [],
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
        hasUnsavedChanges: false,
        lastSavedAt: null,
      });
    },

    fetchModels: async () => {
      const result = await api.fetchAvailableModels();
      if (result.success && result.data) {
        const toOptions = (items: string[] = []) => items.map((id) => ({ label: id, value: id, modelId: id }));
        const nextModels = {
          all: toOptions(result.data.all),
          chat: toOptions(result.data.chat),
          image: toOptions(result.data.image),
          video: toOptions(result.data.video),
        };

        set({
          availableModels: {
            all: nextModels.all,
            chat: nextModels.chat,
            image: nextModels.image,
            video: nextModels.video,
          },
        });

        return { success: true, count: nextModels.all.length };
      }

      return { success: false, error: result.error || '获取模型列表失败', count: 0 };
    },

    setAvailableModels: (models) => set({ availableModels: models }),

    setProjectModels: (models) => set({
      projectModels: normalizeProjectModels(models),
      availableModels: groupConfiguredProjectModels(normalizeProjectModels(models)),
    }),

    persistLocalDraft: () => {
      const state = get();
      saveLocalDraft({
        workflowId: state.workflowId,
        workflowName: state.workflowName,
        nodes: state.nodes,
        edges: state.edges,
      });
    },
  };
}
