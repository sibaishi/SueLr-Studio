import { fetchExecutionHistory } from './api/execution';
import { getNodeDef } from './constants';
import { useWorkflowStore } from './store';

function excerpt(value: unknown, limit = 360) {
  if (typeof value !== 'string') return undefined;
  if (value.startsWith('data:')) return '[内嵌素材]';
  return value.replace(/https?:\/\/[^\s<>"']+/gi, '[外部链接]').slice(0, limit);
}

export async function captureAgentCanvasContext(signal: AbortSignal) {
  const state = useWorkflowStore.getState();
  const runId = state.currentRunId ?? state.lastExecutionRunId;
  const nodeLimit = 60;
  const edgeLimit = 100;
  const nodes = state.nodes.slice(0, nodeLimit).map(({ id, type, data, selected }) => ({
    id,
    type,
    name: excerpt(data.label, 100) || getNodeDef(type ?? '')?.label || type,
    selected: Boolean(selected),
    mode: excerpt(data.mode, 40),
    model: typeof data.model === 'string' ? excerpt(data.model.split('::').at(-1), 120) : undefined,
    prompt: excerpt(data.prompt, 480),
    systemPrompt: excerpt(data.systemPrompt, 480),
    text: type === 'io' ? excerpt(data.text, 480) : undefined,
    settings:
      type === 'aiV3'
        ? {
            ratio: excerpt(data.ratio, 20),
            imageResolution: excerpt(data.imageResolution, 20),
            output_format: excerpt(data.output_format, 20),
            width: typeof data.width === 'number' ? data.width : undefined,
            height: typeof data.height === 'number' ? data.height : undefined,
            n: typeof data.n === 'number' ? data.n : undefined,
            duration: typeof data.duration === 'number' ? data.duration : undefined,
            enableWebSearch: data.enableWebSearch === true,
          }
        : undefined,
    disabled: data.disabled === true,
    runStatus: runId ? state.nodeExecStatus[id] : undefined,
    durationMs: runId ? state.nodeExecutionTime[id] : undefined,
    error: runId ? excerpt(state.nodeErrors[id]) : undefined,
    warning: excerpt(state.nodeWarnings[id]),
  }));
  const nodeIds = new Set(nodes.map(({ id }) => id));
  const edges = state.edges
    .filter(({ source, target }) => nodeIds.has(source) && nodeIds.has(target))
    .slice(0, edgeLimit)
    .map(({ source, target, sourceHandle, targetHandle }) => ({ source, target, sourceHandle, targetHandle }));
  const live = runId
    ? {
        runId,
        status: state.isExecuting ? 'running' : state.lastExecutionStatus,
        durationMs: state.lastExecutionTime,
        error: excerpt(state.lastExecutionError),
        logs: state.executionLogs.slice(-24).map(({ timestamp, level, nodeId, message }) => ({
          timestamp,
          level,
          nodeId,
          message: excerpt(message),
        })),
      }
    : null;

  const response = await fetchExecutionHistory(state.workflowId, signal).catch(() => null);
  signal.throwIfAborted();
  const recent = response?.success
    ? runId
      ? response.data?.find((entry) => entry.runId === runId)
      : response.data?.[0]
    : undefined;
  const files =
    recent?.outputs.filter((url) => {
      if (!/^\/api\/outputs\/[^?#]+$/.test(url)) return false;
      try {
        return url
          .slice('/api/outputs/'.length)
          .split('/')
          .every((part) => {
            const decoded = decodeURIComponent(part);
            return Boolean(decoded) && decoded !== '.' && decoded !== '..' && !/[\\/]/.test(decoded);
          });
      } catch {
        return false;
      }
    }) ?? [];
  const summary = {
    workflow: state.workflowName,
    capturedAt: new Date().toISOString(),
    availableModels: (['chat', 'image', 'video', 'audio', 'midjourney'] as const).map((mode) => ({
      mode,
      models: state.availableModels[mode].slice(0, 25).map(({ value, label }) => ({ value, label })),
    })),
    canvas: {
      totalNodes: state.nodes.length,
      totalEdges: state.edges.length,
      nodes,
      edges,
    },
    currentRun: live,
    recordedRun: recent
      ? {
          runId: recent.runId,
          status: recent.status,
          startedAt: recent.startedAt,
          durationMs: recent.totalDuration,
          error: excerpt(recent.error),
          failures: recent.failures.slice(0, 15).map(({ nodeId, error }) => ({ nodeId, error: excerpt(error) })),
          inputs: recent.inputs?.slice(0, 8).map(({ nodeId, text, files }) => ({
            nodeId,
            text: excerpt(text),
            fileCount: files.length,
          })),
          outputs: files.slice(0, 12).map((url) => excerpt(url.split('/').at(-1), 150)),
        }
      : null,
  };

  return {
    documentId: state.activeDocumentId,
    workflowId: state.workflowId,
    label: state.workflowName,
    runId: runId ?? recent?.runId,
    summary,
    files,
  };
}
