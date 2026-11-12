import * as api from '@/domains/workflow/lib/api';
import { DEFAULT_WORKFLOW_NAME } from '@/domains/workflow/lib/constants';
import { pruneGroupPortEdges } from '@/domains/workflow/lib/groupPorts';
import { groupConfiguredProjectModels, normalizeProjectModels } from '@/domains/workflow/lib/projectModels';
import { normalizeEditorNodes } from '@/domains/workflow/lib/store/editorShared';
import { normalizeEdges, normalizeNodes } from '@/domains/workflow/lib/store/helpers';
import { formatLogDetails, gid, sanitizeLogMessage } from '@/domains/workflow/lib/store/helpers';
import { clearActiveRunSnapshot, saveLocalDraft } from '@/domains/workflow/lib/store/persistence';
import { createClearedNodeExecutionPatch, createClearedRuntimePatch } from '@/domains/workflow/lib/store/runtimeState';
import type {
  WorkflowEditorSnapshot,
  WorkflowState,
  WorkflowStoreGet,
  WorkflowStoreSet,
} from '@/domains/workflow/lib/store/types';
import { loadJSON } from '@/shared/runtime';
import type { ApiConfig } from '@/shared/types';
import { createEmptyWorkflowDocument, getDocumentViewPatch, patchActiveWorkflowDocument } from './documents';

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
        nodeExecutionStartedAt:
          status === 'running'
            ? { ...state.nodeExecutionStartedAt, [nodeId]: Date.now() }
            : state.nodeExecutionStartedAt,
        nodeExecutionActiveCounts:
          status === 'running' ? { ...state.nodeExecutionActiveCounts, [nodeId]: 1 } : state.nodeExecutionActiveCounts,
        nodeExecutionStartedCounts:
          status === 'running'
            ? { ...state.nodeExecutionStartedCounts, [nodeId]: 1 }
            : state.nodeExecutionStartedCounts,
        nodeExecutionExpectedCounts:
          status === 'running'
            ? { ...state.nodeExecutionExpectedCounts, [nodeId]: 1 }
            : state.nodeExecutionExpectedCounts,
        nodeErrors: error ? { ...state.nodeErrors, [nodeId]: error } : state.nodeErrors,
      }));
    },

    clearAllExecStatus: () =>
      set({
        ...createClearedNodeExecutionPatch(),
      }),

    setExecuting: (executing, progress) => {
      set({
        isExecuting: executing,
        executionProgress: progress || null,
        executionMessage: executing ? '准备执行工作流...' : null,
        currentRunId: executing ? get().currentRunId : null,
        lastExecutionRunId: executing ? get().lastExecutionRunId : get().lastExecutionRunId,
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
        lastExecutionRunId: get().currentRunId || get().lastExecutionRunId,
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
        ...createClearedRuntimePatch(),
      });
    },

    newWorkflow: () => {
      clearActiveRunSnapshot();
      set((state) => {
        const document = createEmptyWorkflowDocument({ name: DEFAULT_WORKFLOW_NAME, origin: 'new' });
        return {
          documents: [...patchActiveWorkflowDocument(state), document],
          ...getDocumentViewPatch(document),
        };
      });
    },

    fetchModels: async () => {
      const result = await api.fetchAvailableModels();
      if (result.success && result.data) {
        // 从前端 localStorage 直接取配置名，后端字段仅做 fallback
        const localConfigs: ApiConfig[] = loadJSON('ai_configs', []);
        const localNameMap = new Map(
          localConfigs.map((c, i) => [c.id, c.name?.trim() || c.base?.trim() || `API 配置 ${i + 1}`]),
        );

        const enrichConfigName = (item: {
          label: string;
          value: string;
          modelId: string;
          configId: string;
          configName: string;
        }) => ({
          label: item.label,
          value: item.configId ? `${item.configId}::${item.modelId}` : item.value,
          modelId: item.modelId,
          configId: item.configId,
          configName: localNameMap.get(item.configId) || item.configName || item.configId,
        });

        const nextModels = {
          all: result.data.all.map(enrichConfigName),
          chat: result.data.chat.map(enrichConfigName),
          image: result.data.image.map(enrichConfigName),
          video: result.data.video.map(enrichConfigName),
          audio: result.data.audio?.map(enrichConfigName) || [],
          midjourney: result.data.midjourney?.map(enrichConfigName) || [],
        };

        // 后端不认识 midjourney 类项目模型，别让异步响应覆盖掉 App 层已经同步进去的
        const prevMidjourney = get().availableModels.midjourney || [];
        set({
          availableModels: {
            all: nextModels.all,
            chat: nextModels.chat,
            image: nextModels.image,
            video: nextModels.video,
            audio: nextModels.audio,
            midjourney: nextModels.midjourney.length > 0 ? nextModels.midjourney : prevMidjourney,
          },
        });

        return { success: true, count: nextModels.all.length };
      }

      return { success: false, error: result.error || '获取模型列表失败', count: 0 };
    },

    setAvailableModels: (models) => set({ availableModels: models }),

    setProjectModels: (models) => {
      set({
        projectModels: normalizeProjectModels(models),
        availableModels: groupConfiguredProjectModels(normalizeProjectModels(models)),
      });
      // 异步从后端拉取带 configId/configName 的完整模型列表
      void get().fetchModels();
    },

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
