import * as api from '@/features/workflow/lib/api';
import { clearActiveRunSnapshot, loadActiveRunSnapshot, saveActiveRunSnapshot } from '@/features/workflow/lib/store/persistence';
import {
  buildWorkflowPayload,
  formatLogDetails,
  getAiNodesMissingValidOutputs,
  getNodeDisplayName,
  getNodeDisplayNameById,
  gid,
} from '@/features/workflow/lib/store/helpers';
import type { WorkflowState, WorkflowStoreGet, WorkflowStoreSet } from '@/features/workflow/lib/store/types';

type WorkflowStoreExecutionActions = Pick<
  WorkflowState,
  'executeWorkflow' | 'cancelWorkflowExecution' | 'restoreExecutionRun' | 'syncExecutionRunStatus'
>;

const AI_RESULT_NODE_TYPES = new Set(['aiChat', 'imageGen', 'videoGen']);

function buildSyncedExecutionSummary(status: {
  totalDuration?: number;
  successCount?: number;
  failCount?: number;
}) {
  if (
    typeof status.totalDuration !== 'number'
    || typeof status.successCount !== 'number'
    || typeof status.failCount !== 'number'
  ) {
    return null;
  }

  return {
    totalDuration: status.totalDuration,
    successCount: status.successCount,
    failCount: status.failCount,
  };
}

function settleLingeringNodeExecutions(
  state: WorkflowState,
  options: {
    status: 'success' | 'error';
    fallbackError?: string | null;
  },
) {
  const nextNodeExecStatus = { ...state.nodeExecStatus };
  const nextNodeExecutionTime = { ...state.nodeExecutionTime };
  const nextNodeErrors = { ...state.nodeErrors };
  const now = Date.now();
  let changed = false;

  for (const [nodeId, status] of Object.entries(state.nodeExecStatus)) {
    if (status !== 'running') continue;
    changed = true;
    nextNodeExecStatus[nodeId] = options.status;
    nextNodeExecutionTime[nodeId] = state.nodeExecutionStartedAt[nodeId]
      ? Math.max(0, now - state.nodeExecutionStartedAt[nodeId])
      : nextNodeExecutionTime[nodeId] ?? 0;

    if (options.status === 'error') {
      nextNodeErrors[nodeId] = nextNodeErrors[nodeId] || options.fallbackError || '执行已结束，但未收到节点失败详情';
    }
  }

  if (!changed) return null;

  return {
    nodeExecStatus: nextNodeExecStatus,
    nodeExecutionTime: nextNodeExecutionTime,
    nodeErrors: nextNodeErrors,
  };
}

export function createWorkflowExecutionActions(
  set: WorkflowStoreSet,
  get: WorkflowStoreGet,
): WorkflowStoreExecutionActions {
  return {
    executeWorkflow: async () => {
      const state = get();
      if (state.isExecuting || state.nodes.length === 0) return;

      const aiNodesMissingOutputs = getAiNodesMissingValidOutputs(state.nodes, state.edges);
      if (aiNodesMissingOutputs.length > 0) {
        const labels = aiNodesMissingOutputs.map((node) => getNodeDisplayName(node, state.nodes));
        const nodeWarnings = Object.fromEntries(
          aiNodesMissingOutputs.map((node) => [
            node.id,
            '后方未连接有效且未被禁用的输出节点',
          ]),
        );

        set({
          lastExecutionStatus: 'error',
          lastExecutionError: `以下 AI 节点后方未连接有效且未被禁用的输出节点：${labels.join('、')}`,
          nodeWarnings,
          workflowWarningMessage: `无法启动工作流：${labels.length} 个 AI 节点未连接有效输出`,
        });
        return;
      }

      set({
        executionProgress: null,
        isExecuting: true,
        executionMessage: '准备执行工作流...',
        currentRunId: null,
        executingNodeId: null,
        nodeExecStatus: {},
        nodeExecutionTime: {},
        nodeExecutionStartedAt: {},
        nodeErrors: {},
        nodeWarnings: {},
        nodeOutputs: {},
        workflowWarningMessage: null,
        executionLogs: [{
          id: `log_${gid()}`,
          timestamp: Date.now(),
          level: 'info',
          message: `开始执行工作流：${state.workflowName}`,
          details: { nodeCount: state.nodes.length, edgeCount: state.edges.length },
        }],
        lastExecutionStatus: null,
        lastExecutionTime: null,
        lastExecutionError: null,
        lastExecutionSummary: null,
      });

      const payload = buildWorkflowPayload(
        state.workflowId,
        state.workflowName,
        state.nodes,
        state.edges,
      );

      const saved = await get().saveWorkflow();
      if (!saved) {
        clearActiveRunSnapshot();
        get().addExecutionLog({
          level: 'error',
          message: '工作流保存失败，已取消执行',
        });
        set({
          isExecuting: false,
          executionProgress: null,
          executionMessage: '工作流保存失败，未启动执行',
          currentRunId: null,
          executingNodeId: null,
          lastExecutionStatus: 'error',
          lastExecutionError: '工作流保存失败，未启动执行',
        });
        return;
      }

      await api.executeWorkflow(state.workflowId, { nodes: payload.nodes, edges: payload.edges }, {
        onNodeStart: (data) => {
          const nodeLabel = getNodeDisplayNameById(data.nodeId, get().nodes);
          get().addExecutionLog({
            level: 'info',
            message: `开始节点：${nodeLabel} (${data.index + 1}/${data.total})`,
            nodeId: data.nodeId,
            details: data,
          });
          set((currentState) => ({
            executionProgress: { current: data.index + 1, total: data.total },
            executionMessage: `正在执行：${nodeLabel}`,
            executingNodeId: data.nodeId,
            nodeExecStatus: {
              ...currentState.nodeExecStatus,
              [data.nodeId]: 'running',
            },
            nodeExecutionStartedAt: {
              ...currentState.nodeExecutionStartedAt,
              [data.nodeId]: Date.now(),
            },
            nodeExecutionTime: {
              ...currentState.nodeExecutionTime,
              [data.nodeId]: 0,
            },
          }));
        },
        onNodeProgress: (data) => {
          const nodeLabel = getNodeDisplayNameById(data.nodeId, get().nodes);
          get().addExecutionLog({
            level: 'info',
            message: data.message || `${nodeLabel} 执行中...`,
            nodeId: data.nodeId,
            details: formatLogDetails(data.message || data),
          });
          set({
            executionMessage: `正在执行：${nodeLabel}`,
            executingNodeId: data.nodeId,
          });
        },
        onNodeComplete: (data) => {
          const nodeLabel = getNodeDisplayNameById(data.nodeId, get().nodes);
          get().addExecutionLog({
            level: 'success',
            message: `节点完成：${nodeLabel} (${data.duration} ms)`,
            nodeId: data.nodeId,
            details: formatLogDetails(data.logOutputs ?? data.outputs),
          });
          set((currentState) => ({
            executionMessage: `${nodeLabel} 执行完成`,
            nodeExecStatus: {
              ...currentState.nodeExecStatus,
              [data.nodeId]: 'success',
            },
            nodeExecutionTime: {
              ...currentState.nodeExecutionTime,
              [data.nodeId]: data.duration,
            },
            nodeOutputs: {
              ...currentState.nodeOutputs,
              [data.nodeId]: data.outputs,
            },
            aiResultOutputs: AI_RESULT_NODE_TYPES.has(currentState.nodes.find((node) => node.id === data.nodeId)?.type || '')
              ? {
                  ...currentState.aiResultOutputs,
                  [data.nodeId]: data.outputs,
                }
              : currentState.aiResultOutputs,
          }));
        },
        onNodeError: (data) => {
          const nodeLabel = getNodeDisplayNameById(data.nodeId, get().nodes);
          get().addExecutionLog({
            level: 'error',
            message: `节点失败：${nodeLabel}`,
            nodeId: data.nodeId,
            details: formatLogDetails(data.error),
          });
          set((currentState) => ({
            executionMessage: `${nodeLabel} 执行失败`,
            nodeExecStatus: {
              ...currentState.nodeExecStatus,
              [data.nodeId]: 'error',
            },
            nodeExecutionTime: {
              ...currentState.nodeExecutionTime,
              [data.nodeId]: currentState.nodeExecutionStartedAt[data.nodeId]
                ? Math.max(0, Date.now() - currentState.nodeExecutionStartedAt[data.nodeId])
                : 0,
            },
            nodeErrors: {
              ...currentState.nodeErrors,
              [data.nodeId]: data.error,
            },
          }));
        },
        onWorkflowLog: (data) => {
          get().addExecutionLog({
            level: 'info',
            message: '执行日志已建立',
            details: formatLogDetails(data),
          });
        },
        onSnapshotBuilt: (data) => {
          get().addExecutionLog({
            level: 'info',
            message: '执行快照已构建',
            details: formatLogDetails(data),
          });
        },
        onRunStarted: (data) => {
          saveActiveRunSnapshot({
            runId: data.runId,
            workflowId: data.workflowId,
            source: data.source,
            snapshotVersion: data.snapshotVersion,
          });
          set({ currentRunId: data.runId });
          get().addExecutionLog({
            level: 'info',
            message: '执行运行已启动',
            details: formatLogDetails(data),
          });
        },
        onWorkflowComplete: (data) => {
          clearActiveRunSnapshot();
          const latestState = get();
          const nextAiResultOutputs = Object.fromEntries(
            latestState.nodes
              .filter((node) => AI_RESULT_NODE_TYPES.has(node.type || '') && latestState.nodeOutputs[node.id])
              .map((node) => [node.id, latestState.nodeOutputs[node.id]]),
          );
          get().addExecutionLog({
            level: data.failCount > 0 ? 'error' : 'success',
            message: `工作流完成：${data.successCount} 成功 / ${data.failCount} 失败 (${data.totalDuration} ms)`,
            details: formatLogDetails(data),
          });
          set({
            isExecuting: false,
            executionProgress: null,
            executionMessage: data.failCount > 0 ? '工作流执行完成，但有节点失败' : '工作流执行完成',
            currentRunId: null,
            executingNodeId: null,
            lastExecutionStatus: data.failCount > 0 ? 'error' : 'success',
            lastExecutionTime: data.totalDuration,
            lastExecutionSummary: {
              successCount: data.successCount,
              failCount: data.failCount,
              totalDuration: data.totalDuration,
            },
            aiResultOutputs: nextAiResultOutputs,
          });
        },
        onWorkflowError: (data) => {
          clearActiveRunSnapshot();
          get().addExecutionLog({
            level: 'error',
            message: '工作流失败',
            details: formatLogDetails(data.error),
          });
          set({
            isExecuting: false,
            executionProgress: null,
            executionMessage: '工作流执行失败',
            currentRunId: null,
            executingNodeId: null,
            lastExecutionStatus: 'error',
            lastExecutionError: data.error || '未知错误',
            lastExecutionSummary: null,
          });
        },
      });
    },

    cancelWorkflowExecution: async () => {
      const state = get();
      if (!state.isExecuting) return;

      get().addExecutionLog({
        level: 'info',
        message: '用户请求停止工作流',
      });

      set({
        executionMessage: '正在停止工作流...',
      });

      try {
        if (!state.currentRunId) {
          clearActiveRunSnapshot();
          set({
            isExecuting: false,
            executionProgress: null,
            executionMessage: '工作流执行已停止',
            currentRunId: null,
            executingNodeId: null,
            lastExecutionStatus: 'error',
            lastExecutionError: '没有可取消的运行 ID',
          });
          return;
        }
        await api.cancelExecution(state.currentRunId);
      } catch {
        // Ignore cancellation request failures here; the SSE channel will settle the final state.
      }
    },

    restoreExecutionRun: async () => {
      const activeRun = loadActiveRunSnapshot();
      if (!activeRun) return;

      const statusResult = await api.fetchExecutionStatus(activeRun.runId);
      if (!statusResult.success || !statusResult.data || statusResult.data.status !== 'running') {
        clearActiveRunSnapshot();
        return;
      }

      const status = statusResult.data;
      if (status.workflowId && status.workflowId !== get().workflowId) {
        await get().loadWorkflow(status.workflowId);
      }

      set((state) => ({
        isExecuting: true,
        executionMessage: state.executionMessage || '已恢复工作流执行状态...',
        currentRunId: status.runId,
        lastExecutionStatus: null,
        lastExecutionError: null,
      }));

      get().addExecutionLog({
        level: 'info',
        message: '已恢复执行运行状态',
        details: formatLogDetails(status),
      });
    },

    syncExecutionRunStatus: async () => {
      const state = get();
      if (!state.currentRunId) return;

      const statusResult = await api.fetchExecutionStatus(state.currentRunId);
      if (!statusResult.success || !statusResult.data) return;

      const syncedStatus = statusResult.data;
      if (syncedStatus.status === 'running') {
        if (!state.isExecuting) {
          set({
            isExecuting: true,
            executionMessage: '\u5df2\u91cd\u65b0\u8fde\u63a5\u5230\u5de5\u4f5c\u6d41\u6267\u884c...',
          });
        }
        return;
      }

      clearActiveRunSnapshot();
      get().addExecutionLog({
        level: 'info',
        message: `\u6267\u884c\u8fd0\u884c\u72b6\u6001\u5df2\u540c\u6b65\u4e3a\uff1a${syncedStatus.status}` ,
        details: formatLogDetails(syncedStatus),
      });

      if (syncedStatus.status === 'completed') {
        const currentState = get();
        const settledNodes = settleLingeringNodeExecutions(currentState, {
          status: typeof syncedStatus.failCount === 'number' && syncedStatus.failCount > 0 ? 'error' : 'success',
          fallbackError: syncedStatus.error || '工作流已结束，但部分节点未返回最终事件',
        });

        set({
          isExecuting: false,
          executionProgress: null,
          executionMessage: '\u5de5\u4f5c\u6d41\u6267\u884c\u5b8c\u6210',
          currentRunId: null,
          executingNodeId: null,
          lastExecutionStatus: typeof syncedStatus.failCount === 'number' && syncedStatus.failCount > 0 ? 'error' : 'success',
          lastExecutionTime: syncedStatus.totalDuration ?? null,
          lastExecutionError: syncedStatus.error ?? null,
          lastExecutionSummary: buildSyncedExecutionSummary(syncedStatus),
          ...settledNodes,
        });
        return;
      }

      if (syncedStatus.status === 'failed' || syncedStatus.status === 'cancelled') {
        const currentState = get();
        const fallbackError = syncedStatus.error
          || (syncedStatus.status === 'cancelled'
            ? '\u5de5\u4f5c\u6d41\u6267\u884c\u5df2\u53d6\u6d88'
            : '\u672a\u77e5\u9519\u8bef');
        const settledNodes = settleLingeringNodeExecutions(currentState, {
          status: 'error',
          fallbackError,
        });

        get().addExecutionLog({
          level: 'error',
          message: syncedStatus.status === 'cancelled'
            ? '\u5de5\u4f5c\u6d41\u6267\u884c\u5df2\u505c\u6b62'
            : '\u5de5\u4f5c\u6d41\u6267\u884c\u5931\u8d25',
          details: formatLogDetails(fallbackError),
        });

        set({
          isExecuting: false,
          executionProgress: null,
          executionMessage: syncedStatus.status === 'cancelled'
            ? '\u5de5\u4f5c\u6d41\u6267\u884c\u5df2\u505c\u6b62'
            : '\u5de5\u4f5c\u6d41\u6267\u884c\u5931\u8d25',
          currentRunId: null,
          executingNodeId: null,
          lastExecutionStatus: 'error',
          lastExecutionTime: syncedStatus.totalDuration ?? null,
          lastExecutionError: fallbackError,
          lastExecutionSummary: buildSyncedExecutionSummary(syncedStatus),
          ...settledNodes,
        });
        return;
      }

      set({
        isExecuting: false,
        executionProgress: null,
        executionMessage: null,
        currentRunId: null,
        executingNodeId: null,
      });
    },
  };
}
