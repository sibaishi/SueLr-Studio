import * as api from '@/domains/workflow/lib/api/execution';
import { getNodeDef } from '@/domains/workflow/lib/constants';
import {
  filterExecutionGraphToUpstreamTarget,
  projectWorkflowToExecutionGraph,
} from '@/domains/workflow/lib/executionGraph';
import {
  buildWorkflowPayload,
  formatLogDetails,
  getAiNodesMissingValidOutputs,
  getNodeDisplayName,
  getNodeDisplayNameById,
  gid,
} from '@/domains/workflow/lib/store/helpers';
import {
  clearActiveRunSnapshot,
  loadActiveRunSnapshot,
  saveActiveRunSnapshot,
} from '@/domains/workflow/lib/store/persistence';
import type { WorkflowState, WorkflowStoreGet, WorkflowStoreSet } from '@/domains/workflow/lib/store/types';
import type { Edge, Node } from '@xyflow/react';

type WorkflowStoreExecutionActions = Pick<
  WorkflowState,
  | 'executeWorkflow'
  | 'executeWorkflowToNode'
  | 'cancelWorkflowExecution'
  | 'restoreExecutionRun'
  | 'syncExecutionRunStatus'
>;

const MULTI_INPUT_NODE_TYPES = new Set(['aiV3', 'io']);

function sortEdgesByInputOrder(nodes: Node[], edges: Edge[]) {
  const multiInputNodes = nodes.filter((n) => MULTI_INPUT_NODE_TYPES.has(n.type || ''));
  if (multiInputNodes.length === 0) return edges;

  const multiInputNodeIds = new Set(multiInputNodes.map((n) => n.id));

  // Group edges by their target (only for multi-input nodes)
  const targetEdgeMap = new Map<string, Edge[]>();
  const otherEdges: Edge[] = [];
  for (const edge of edges) {
    if (multiInputNodeIds.has(edge.target)) {
      const group = targetEdgeMap.get(edge.target) || [];
      group.push(edge);
      targetEdgeMap.set(edge.target, group);
    } else {
      otherEdges.push(edge);
    }
  }

  // Sort each group by inputOrder
  for (const node of multiInputNodes) {
    const nodeEdges = targetEdgeMap.get(node.id);
    if (!nodeEdges || nodeEdges.length <= 1) continue;
    const inputOrder: string[] = Array.isArray(node.data?.inputOrder) ? (node.data.inputOrder as string[]) : [];
    if (inputOrder.length === 0) continue;
    const orderMap = new Map(inputOrder.map((id, i) => [id, i]));
    nodeEdges.sort((a, b) => {
      const ai = orderMap.get(a.id);
      const bi = orderMap.get(b.id);
      if (ai !== undefined && bi !== undefined) return ai - bi;
      if (ai !== undefined) return -1;
      if (bi !== undefined) return 1;
      return 0;
    });
  }

  // Reconstruct edges array: sorted groups after otherEdges
  const sorted: Edge[] = [...otherEdges];
  for (const [, group] of targetEdgeMap) {
    sorted.push(...group);
  }
  return sorted;
}

const AI_RESULT_NODE_TYPES = new Set(['aiV3']);
const RUN_TO_NODE_BLOCKED_TYPES = new Set(['aiV3']);

function sanitizeSavedFile(file: unknown) {
  if (!file || typeof file !== 'object') return file;
  const record = file as Record<string, unknown>;
  return {
    type: typeof record.type === 'string' ? record.type : '',
    name: typeof record.name === 'string' ? record.name : '',
    url: typeof record.url === 'string' ? record.url : '',
    thumbnailUrl: typeof record.thumbnailUrl === 'string' ? record.thumbnailUrl : '',
    mimeType: typeof record.mimeType === 'string' ? record.mimeType : '',
    width: typeof record.width === 'number' ? record.width : undefined,
    height: typeof record.height === 'number' ? record.height : undefined,
  };
}

function sanitizeNodeOutputValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeNodeOutputValue(item));
  }

  if (!value || typeof value !== 'object') return value;

  const record = value as Record<string, unknown>;
  if (typeof record.url === 'string') {
    return sanitizeSavedFile(record);
  }

  const sanitizedEntries = Object.entries(record)
    .filter(([key]) => !['rawData', 'rawImages', 'request'].includes(key))
    .map(([key, entryValue]) => [key, sanitizeNodeOutputValue(entryValue)] as const);
  return Object.fromEntries(sanitizedEntries);
}

function sanitizeNodeOutputs(outputs: Record<string, unknown>) {
  const sanitized = sanitizeNodeOutputValue(outputs);
  return sanitized && typeof sanitized === 'object' && !Array.isArray(sanitized)
    ? (sanitized as Record<string, unknown>)
    : outputs;
}

function mergeRepeatedOutputValue(existing: unknown, next: unknown) {
  if (existing === undefined) return next;
  if (Array.isArray(existing) && Array.isArray(next)) return [...existing, ...next];
  if (Array.isArray(existing)) return [...existing, next];
  if (Array.isArray(next)) return [existing, ...next];
  return [existing, next];
}

function appendRepeatedNodeOutputs(existing: Record<string, unknown> | undefined, next: Record<string, unknown>) {
  if (!existing) return next;
  const merged = { ...existing };
  for (const [key, value] of Object.entries(next)) {
    merged[key] = mergeRepeatedOutputValue(merged[key], value);
  }
  return merged;
}

function shouldPersistTextInputOutput(state: WorkflowState, nodeId: string, outputs: Record<string, unknown>) {
  const node = state.nodes.find((item) => item.id === nodeId);
  if (node?.type !== 'textInput') return false;
  if (typeof outputs.text !== 'string') return false;
  return state.edges.some(
    (edge) => edge.target === nodeId && ['input', 'text'].includes(String(edge.targetHandle || '')),
  );
}

function buildTextSplitSegmentsFromOutputs(outputs: Record<string, unknown>) {
  return Object.entries(outputs)
    .filter(([key]) => /^part\d+$/.test(key))
    .sort(([keyA], [keyB]) => Number(keyA.replace('part', '')) - Number(keyB.replace('part', '')))
    .map(([, value]) => String(value ?? ''));
}

function getNodeEventExpectedCount(data: { iteration?: { total?: number } }) {
  if (typeof data.iteration?.total === 'number' && Number.isFinite(data.iteration.total)) {
    return Math.max(1, Math.round(data.iteration.total));
  }
  return 1;
}

function shouldPersistTextSplitOutput(state: WorkflowState, nodeId: string, outputs: Record<string, unknown>) {
  const node = state.nodes.find((item) => item.id === nodeId);
  if (node?.type !== 'textSplit') return false;
  if (buildTextSplitSegmentsFromOutputs(outputs).length === 0) return false;
  return state.edges.some((edge) => edge.target === nodeId && String(edge.targetHandle || '') === 'text');
}

function isRunToNodeAllowed(node: Node | undefined) {
  if (!node || node.type === 'group' || node.data?.disabled || RUN_TO_NODE_BLOCKED_TYPES.has(node.type || ''))
    return false;
  const def = getNodeDef(node.type || '');
  return Boolean(def && ((def.inputs?.length || 0) > 0 || (def.maxInputs || 0) > 0));
}

function buildSyncedExecutionSummary(status: {
  totalDuration?: number;
  successCount?: number;
  failCount?: number;
}) {
  if (
    typeof status.totalDuration !== 'number' ||
    typeof status.successCount !== 'number' ||
    typeof status.failCount !== 'number'
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
  const nextNodeExecutionActiveCounts = { ...state.nodeExecutionActiveCounts };
  const nextNodeErrors = { ...state.nodeErrors };
  const now = Date.now();
  let changed = false;

  for (const [nodeId, status] of Object.entries(state.nodeExecStatus)) {
    if (status !== 'running') continue;
    changed = true;
    nextNodeExecStatus[nodeId] = options.status;
    nextNodeExecutionActiveCounts[nodeId] = 0;
    nextNodeExecutionTime[nodeId] = state.nodeExecutionStartedAt[nodeId]
      ? Math.max(0, now - state.nodeExecutionStartedAt[nodeId])
      : (nextNodeExecutionTime[nodeId] ?? 0);

    if (options.status === 'error') {
      nextNodeErrors[nodeId] = nextNodeErrors[nodeId] || options.fallbackError || '执行已结束，但未收到节点失败详情';
    }
  }

  if (!changed) return null;

  return {
    nodeExecStatus: nextNodeExecStatus,
    nodeExecutionTime: nextNodeExecutionTime,
    nodeExecutionActiveCounts: nextNodeExecutionActiveCounts,
    nodeErrors: nextNodeErrors,
  };
}

export function createWorkflowExecutionActions(
  set: WorkflowStoreSet,
  get: WorkflowStoreGet,
): WorkflowStoreExecutionActions {
  const runWorkflow = async (options: { targetNodeId?: string } = {}) => {
    const state = get();
    if (state.isExecuting || state.nodes.length === 0) return;

    const fullExecutableGraph = projectWorkflowToExecutionGraph(state.nodes, state.edges);
    const executableGraph = options.targetNodeId
      ? filterExecutionGraphToUpstreamTarget(fullExecutableGraph, options.targetNodeId)
      : fullExecutableGraph;
    const targetNode = options.targetNodeId ? state.nodes.find((node) => node.id === options.targetNodeId) : null;

    if (options.targetNodeId && !isRunToNodeAllowed(targetNode || undefined)) {
      set({
        lastExecutionStatus: 'error',
        lastExecutionError: '目标节点不存在或不可执行',
        workflowWarningMessage: '无法运行到该节点：目标节点不存在或不可执行',
      });
      return;
    }

    if (options.targetNodeId && executableGraph.nodes.length === 0) {
      set({
        lastExecutionStatus: 'error',
        lastExecutionError: '目标节点不存在或不可执行',
        workflowWarningMessage: '无法运行到该节点：目标节点不存在或不可执行',
      });
      return;
    }

    const aiNodesMissingOutputs = options.targetNodeId
      ? []
      : getAiNodesMissingValidOutputs(executableGraph.nodes, executableGraph.edges);
    if (aiNodesMissingOutputs.length > 0) {
      const labels = aiNodesMissingOutputs.map((node) => getNodeDisplayName(node, executableGraph.nodes));
      const nodeWarnings = Object.fromEntries(
        aiNodesMissingOutputs.map((node) => [node.id, '后方未连接有效且未被禁用的输出节点']),
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
      executionMessage: options.targetNodeId ? '正在准备运行到节点...' : '准备执行工作流...',
      currentRunId: null,
      lastExecutionRunId: null,
      executingNodeId: null,
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
      workflowWarningMessage: null,
      executionLogs: [
        {
          id: `log_${gid()}`,
          timestamp: Date.now(),
          level: 'info',
          message: options.targetNodeId
            ? `开始运行到节点：${getNodeDisplayName(targetNode || undefined, state.nodes)}`
            : `开始执行工作流：${state.workflowName}`,
          details: {
            nodeCount: executableGraph.nodes.length,
            edgeCount: executableGraph.edges.length,
            ...(options.targetNodeId ? { targetNodeId: options.targetNodeId } : {}),
          },
        },
      ],
      lastExecutionStatus: null,
      lastExecutionTime: null,
      lastExecutionError: null,
      lastExecutionSummary: null,
    });

    // Reorder edges for multi-input nodes (aiV3) based on inputOrder
    const sortedEdges = sortEdgesByInputOrder(executableGraph.nodes, executableGraph.edges);
    const executableGraphOrdered = { nodes: executableGraph.nodes, edges: sortedEdges };

    const payload = buildWorkflowPayload(
      state.workflowId,
      state.workflowName,
      executableGraphOrdered.nodes,
      executableGraphOrdered.edges,
    );

    // Inject _rawContent for io nodes into PAYLOAD only (not store)
    for (const pnode of payload.nodes) {
      if (pnode.type !== 'io') continue;
      const nd = pnode.data as Record<string, unknown>;
      const fileIds: number[] | undefined = nd._fileIds as number[] | undefined;
      if (!fileIds?.length) continue;
      const fileOrder: number[] = (nd._fileOrder as number[]) || [];
      const orderMap = new Map(fileOrder.map((id, i) => [id, i]));
      const sortedIds = [...fileIds].sort((a, b) => {
        const ai = orderMap.get(a); const bi = orderMap.get(b);
        if (ai !== undefined && bi !== undefined) return ai - bi;
        if (ai !== undefined) return -1;
        if (bi !== undefined) return 1;
        return 0;
      });
      try {
        const { fileRawStore } = await import('@/domains/workflow/components/nodes/io/fileRawStore');
        const rawFiles: string[] = [];
        for (const fid of sortedIds) {
          const b64 = fileRawStore.getBase64(fid);
          if (b64) rawFiles.push(b64);
        }
        if (rawFiles.length > 0) {
          nd._rawContent = rawFiles.length === 1 ? rawFiles[0] : rawFiles;
        }
      } catch { /* fileRawStore not available, skip */ }
    }

    const runtimeApiConfig =
      state.workflowRuntimeConfigs.length > 0 ? { configs: state.workflowRuntimeConfigs } : undefined;

    const callbacks: api.SSECallbacks = {
      onNodeStart: (data) => {
        const nodeLabel = getNodeDisplayNameById(data.nodeId, get().nodes);
        get().addExecutionLog({
          level: 'info',
          message: `开始节点：${nodeLabel} (${data.index + 1}/${data.total})`,
          nodeId: data.nodeId,
          details: data,
        });
        set((currentState) => {
          const startedCount = (currentState.nodeExecutionStartedCounts[data.nodeId] || 0) + 1;
          const activeCount = (currentState.nodeExecutionActiveCounts[data.nodeId] || 0) + 1;
          const expectedCount = Math.max(
            currentState.nodeExecutionExpectedCounts[data.nodeId] || 0,
            getNodeEventExpectedCount(data),
            startedCount,
          );

          return {
            executionProgress: { current: data.index + 1, total: data.total },
            executionMessage: `正在执行：${nodeLabel}`,
            executingNodeId: data.nodeId,
            nodeExecStatus: {
              ...currentState.nodeExecStatus,
              [data.nodeId]: 'running',
            },
            nodeExecutionStartedAt: {
              ...currentState.nodeExecutionStartedAt,
              [data.nodeId]: currentState.nodeExecutionStartedAt[data.nodeId] || Date.now(),
            },
            nodeExecutionTime: {
              ...currentState.nodeExecutionTime,
              [data.nodeId]: 0,
            },
            nodeExecutionActiveCounts: {
              ...currentState.nodeExecutionActiveCounts,
              [data.nodeId]: activeCount,
            },
            nodeExecutionStartedCounts: {
              ...currentState.nodeExecutionStartedCounts,
              [data.nodeId]: startedCount,
            },
            nodeExecutionExpectedCounts: {
              ...currentState.nodeExecutionExpectedCounts,
              [data.nodeId]: expectedCount,
            },
          };
        });
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
        const sanitizedOutputs = sanitizeNodeOutputs(data.outputs);
        get().addExecutionLog({
          level: 'success',
          message: `节点完成：${nodeLabel} (${data.duration} ms)`,
          nodeId: data.nodeId,
          details: formatLogDetails(data.logOutputs ?? sanitizedOutputs),
        });
        set((currentState) => {
          const persistTextOutput = shouldPersistTextInputOutput(currentState, data.nodeId, sanitizedOutputs);
          const persistTextSplitOutput = shouldPersistTextSplitOutput(currentState, data.nodeId, sanitizedOutputs);
          const activeCount = Math.max(0, (currentState.nodeExecutionActiveCounts[data.nodeId] || 0) - 1);
          const completedCount = (currentState.nodeExecutionCompletedCounts[data.nodeId] || 0) + 1;
          const expectedCount = Math.max(
            currentState.nodeExecutionExpectedCounts[data.nodeId] || 0,
            getNodeEventExpectedCount(data),
            completedCount,
          );
          const allKnownExecutionsCompleted = activeCount === 0 && completedCount >= expectedCount;
          const startedAt = currentState.nodeExecutionStartedAt[data.nodeId];
          const aggregateDuration = startedAt ? Math.max(0, Date.now() - startedAt) : data.duration;
          const mergedNodeOutputs = data.iteration
            ? appendRepeatedNodeOutputs(currentState.nodeOutputs[data.nodeId], sanitizedOutputs)
            : sanitizedOutputs;
          return {
            executionMessage: `${nodeLabel} 执行完成`,
            nodes:
              persistTextOutput || persistTextSplitOutput
                ? currentState.nodes.map((node) =>
                    node.id === data.nodeId
                      ? {
                          ...node,
                          data: {
                            ...node.data,
                            ...(persistTextOutput ? { text: sanitizedOutputs.text } : {}),
                            ...(persistTextSplitOutput
                              ? { segments: buildTextSplitSegmentsFromOutputs(sanitizedOutputs) }
                              : {}),
                          },
                        }
                      : node,
                  )
                : currentState.nodes,
            hasUnsavedChanges: persistTextOutput || persistTextSplitOutput ? true : currentState.hasUnsavedChanges,
            nodeExecStatus: {
              ...currentState.nodeExecStatus,
              [data.nodeId]: allKnownExecutionsCompleted ? 'success' : 'running',
            },
            nodeExecutionTime: {
              ...currentState.nodeExecutionTime,
              [data.nodeId]: allKnownExecutionsCompleted ? aggregateDuration : 0,
            },
            nodeExecutionActiveCounts: {
              ...currentState.nodeExecutionActiveCounts,
              [data.nodeId]: activeCount,
            },
            nodeExecutionCompletedCounts: {
              ...currentState.nodeExecutionCompletedCounts,
              [data.nodeId]: completedCount,
            },
            nodeExecutionExpectedCounts: {
              ...currentState.nodeExecutionExpectedCounts,
              [data.nodeId]: expectedCount,
            },
            nodeOutputs: {
              ...currentState.nodeOutputs,
              [data.nodeId]: mergedNodeOutputs,
            },
            aiResultOutputs: AI_RESULT_NODE_TYPES.has(
              currentState.nodes.find((node) => node.id === data.nodeId)?.type || '',
            )
              ? {
                  ...currentState.aiResultOutputs,
                  [data.nodeId]: mergedNodeOutputs,
                }
              : currentState.aiResultOutputs,
          };
        });
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
          nodeExecutionActiveCounts: {
            ...currentState.nodeExecutionActiveCounts,
            [data.nodeId]: Math.max(0, (currentState.nodeExecutionActiveCounts[data.nodeId] || 0) - 1),
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
        set({ currentRunId: data.runId, lastExecutionRunId: data.runId });
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
          lastExecutionRunId: get().lastExecutionRunId,
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
          lastExecutionRunId: get().lastExecutionRunId,
          executingNodeId: null,
          lastExecutionStatus: 'error',
          lastExecutionError: data.error || '未知错误',
          lastExecutionSummary: null,
        });
      },
    };
    if (runtimeApiConfig) {
      await api.executeWorkflow(
        state.workflowId,
        { name: state.workflowName, nodes: payload.nodes, edges: payload.edges },
        callbacks,
        runtimeApiConfig,
      );
    } else {
      await api.executeWorkflow(
        state.workflowId,
        { name: state.workflowName, nodes: payload.nodes, edges: payload.edges },
        callbacks,
      );
    }
  };

  return {
    executeWorkflow: async () => {
      await runWorkflow();
    },

    executeWorkflowToNode: async (nodeId: string) => {
      await runWorkflow({ targetNodeId: nodeId });
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
            lastExecutionRunId: state.currentRunId || state.lastExecutionRunId,
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
        lastExecutionRunId: status.runId,
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
        message: `\u6267\u884c\u8fd0\u884c\u72b6\u6001\u5df2\u540c\u6b65\u4e3a\uff1a${syncedStatus.status}`,
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
          lastExecutionRunId: syncedStatus.runId || state.currentRunId || state.lastExecutionRunId,
          executingNodeId: null,
          lastExecutionStatus:
            typeof syncedStatus.failCount === 'number' && syncedStatus.failCount > 0 ? 'error' : 'success',
          lastExecutionTime: syncedStatus.totalDuration ?? null,
          lastExecutionError: syncedStatus.error ?? null,
          lastExecutionSummary: buildSyncedExecutionSummary(syncedStatus),
          ...settledNodes,
        });
        return;
      }

      if (syncedStatus.status === 'failed' || syncedStatus.status === 'cancelled') {
        const currentState = get();
        const fallbackError =
          syncedStatus.error ||
          (syncedStatus.status === 'cancelled'
            ? '\u5de5\u4f5c\u6d41\u6267\u884c\u5df2\u53d6\u6d88'
            : '\u672a\u77e5\u9519\u8bef');
        const settledNodes = settleLingeringNodeExecutions(currentState, {
          status: 'error',
          fallbackError,
        });

        get().addExecutionLog({
          level: 'error',
          message:
            syncedStatus.status === 'cancelled'
              ? '\u5de5\u4f5c\u6d41\u6267\u884c\u5df2\u505c\u6b62'
              : '\u5de5\u4f5c\u6d41\u6267\u884c\u5931\u8d25',
          details: formatLogDetails(fallbackError),
        });

        set({
          isExecuting: false,
          executionProgress: null,
          executionMessage:
            syncedStatus.status === 'cancelled'
              ? '\u5de5\u4f5c\u6d41\u6267\u884c\u5df2\u505c\u6b62'
              : '\u5de5\u4f5c\u6d41\u6267\u884c\u5931\u8d25',
          currentRunId: null,
          lastExecutionRunId: syncedStatus.runId || state.currentRunId || state.lastExecutionRunId,
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
        lastExecutionRunId: state.currentRunId || state.lastExecutionRunId,
        executingNodeId: null,
      });
    },
  };
}
