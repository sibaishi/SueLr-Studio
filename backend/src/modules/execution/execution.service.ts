import { executeWorkflow } from '../../engine/executor.js';
import { createLogger } from '../../platform/logging/logger.js';
import { runWithRequestContext } from '../../platform/logging/request-context.js';
import { getProcessInstanceId } from '../../platform/logging/runtime-observability.js';
import { WORKFLOW_SSE_EVENTS } from '../../platform/logging/workflow-events.js';
import { sanitizeNodeOutputsForLogs } from '../../platform/logging/workflow-log-sanitizer.js';
import { createWorkflowRunLogger } from '../../platform/logging/workflow-run-logger.js';
import { settingsService } from '../settings/settings.service.js';
import type { DynamicValue, PlainObject } from '../types.js';
import { workflowsRepository } from '../workflows/workflows.repository.js';
import { createExecutionSnapshot } from './execution-snapshot.js';

const logger = createLogger({ module: 'execution-service' });
const RECENT_RUN_TTL_MS = 5 * 60 * 1000;
const AGENT_INPUT_NODE_ALIASES: Record<string, string[]> = {
  textInput: ['textinput', 'text', 'prompt', 'question', '文本输入', '文本'],
  imageInput: ['imageinput', 'image', 'reference', '图片输入', '图片', '图像输入', '图像'],
  videoInput: ['videoinput', 'video', '视频输入', '视频'],
  audioInput: ['audioinput', 'audio', '音频输入', '音频'],
  maskInput: ['maskinput', 'mask', '蒙版输入', '蒙版'],
};

type WorkflowNode = PlainObject & {
  id: string;
  type: string;
  data: PlainObject;
};

type WorkflowArtifact = {
  type: string;
  url: string;
  name: string;
  mimeType?: string;
};

type InputTarget = {
  node: WorkflowNode;
  ordinal: number;
  aliases: Set<string>;
};

type AppliedInput = {
  nodeId: string;
  nodeType: string;
  field: string;
  matchedBy: string;
};

type RunStatus = PlainObject & {
  status: string;
  runId: string;
};

type RunningExecution = {
  runId: string;
  workflowId: string;
  source: string;
  snapshotVersion: number;
  abortController: AbortController;
};

type RecentExecution = {
  status: RunStatus;
  expiresAt: number;
};

type ExecutionRepository = {
  read: (id: string) => { workflow: PlainObject };
  list: () => PlainObject[];
};

type SseResponse = {
  writableEnded?: boolean;
  write: (...args: DynamicValue[]) => boolean;
  end: () => unknown;
};

function asWorkflowNode(value: DynamicValue): WorkflowNode {
  const node = isPlainObject(value) ? value : {};
  return {
    ...node,
    id: String(node.id || ''),
    type: String(node.type || ''),
    data: isPlainObject(node.data) ? node.data : {},
  };
}

function cleanString(value: DynamicValue, maxLength = 5000): string {
  if (value === undefined || value === null) return '';
  return String(value).trim().slice(0, maxLength);
}

function normalizeForMatch(value: DynamicValue): string {
  return cleanString(value, 500).toLowerCase();
}

function summarizeValue(value: DynamicValue, maxLength = 240): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return cleanString(value, maxLength);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return cleanString(JSON.stringify(value.slice(0, 3)), maxLength);
  }
  if (typeof value === 'object') {
    const preferred = [
      (value as PlainObject).content,
      (value as PlainObject).text,
      (value as PlainObject).url,
      Array.isArray((value as PlainObject).savedFiles) ? (value as PlainObject).savedFiles[0] : '',
      Array.isArray((value as PlainObject).savedPaths) ? (value as PlainObject).savedPaths[0] : '',
    ].find((item) => typeof item === 'string' && item.trim());
    if (preferred) return cleanString(preferred, maxLength);
    try {
      return cleanString(JSON.stringify(value), maxLength);
    } catch {
      return '[object]';
    }
  }
  return cleanString(String(value), maxLength);
}

function summarizeNodeOutputs(outputs: DynamicValue): string {
  if (!outputs || typeof outputs !== 'object') {
    return summarizeValue(outputs);
  }
  const summaryParts = Object.entries(outputs)
    .slice(0, 3)
    .map(([key, value]) => `${key}: ${summarizeValue(value, 160)}`)
    .filter((item) => item && !item.endsWith(': '));

  return summaryParts.join('; ').slice(0, 500);
}

function detectArtifactTypeFromUrl(value: DynamicValue): string {
  const source = cleanString(value, 4000).toLowerCase();
  if (!source) return 'file';
  if (/^data:image\//.test(source) || /\.(png|jpe?g|gif|webp|bmp|svg)(\?.*)?$/.test(source)) return 'image';
  if (/^data:video\//.test(source) || /\.(mp4|mov|webm|m4v)(\?.*)?$/.test(source)) return 'video';
  if (/^data:audio\//.test(source) || /\.(mp3|wav|ogg|m4a|aac|flac)(\?.*)?$/.test(source)) return 'audio';
  if (/\.(txt|md|markdown|json|jsonl|csv|log|xml|yaml|yml)(\?.*)?$/.test(source)) return 'text';
  return 'file';
}

function collectWorkflowArtifacts(
  value: DynamicValue,
  bucket: WorkflowArtifact[] = [],
  seen: Set<string> = new Set(),
): WorkflowArtifact[] {
  if (value === undefined || value === null) return bucket;

  if (typeof value === 'string') {
    const url = cleanString(value, 4000);
    if (!url) return bucket;
    const isArtifactUrl =
      url.startsWith('/api/outputs/') ||
      url.startsWith('/api/files/') ||
      url.startsWith('data:image/') ||
      url.startsWith('data:video/') ||
      url.startsWith('data:audio/');
    if (!isArtifactUrl || seen.has(url)) return bucket;
    seen.add(url);
    bucket.push({
      type: detectArtifactTypeFromUrl(url),
      url,
      name: url.split('/').pop() || url,
    });
    return bucket;
  }

  if (Array.isArray(value)) {
    for (const item of value) collectWorkflowArtifacts(item, bucket, seen);
    return bucket;
  }

  if (!isPlainObject(value)) return bucket;

  const url = cleanString(value.url, 4000);
  if (url && !seen.has(url)) {
    seen.add(url);
    bucket.push({
      type: cleanString(value.type, 40) || detectArtifactTypeFromUrl(url),
      url,
      name: cleanString(value.name, 200) || url.split('/').pop() || url,
      mimeType: cleanString(value.mimeType, 120) || undefined,
    });
  }

  for (const nested of Object.values(value)) {
    collectWorkflowArtifacts(nested, bucket, seen);
  }
  return bucket;
}

function cloneWorkflow(workflow: DynamicValue): PlainObject {
  return {
    ...workflow,
    nodes: Array.isArray(workflow?.nodes)
      ? workflow.nodes.map((node: DynamicValue) => ({
          ...node,
          data: node?.data && typeof node.data === 'object' ? { ...node.data } : {},
        }))
      : [],
    edges: Array.isArray(workflow?.edges) ? workflow.edges.map((edge: DynamicValue) => ({ ...edge })) : [],
    settings: workflow?.settings && typeof workflow.settings === 'object' ? { ...workflow.settings } : {},
  };
}

function isPlainObject(value: DynamicValue): value is PlainObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeLookupKey(value: DynamicValue): string {
  return cleanString(value, 500)
    .toLowerCase()
    .replace(/[\s\-_.:：、，,()[\]{}"'`]/g, '');
}

function getInputNodeAliases(node: WorkflowNode, ordinal = 1): Set<string> {
  const normalizedOrdinal = Number.isFinite(ordinal) && ordinal > 0 ? Math.trunc(ordinal) : 1;
  const aliases = new Set<string>();
  const push = (value: DynamicValue) => {
    const normalized = normalizeLookupKey(value);
    if (normalized) aliases.add(normalized);
  };

  push(node.id);
  push(node.data?.title);
  push(node.data?.label);
  push(node.data?.name);
  push(node.data?.text);

  const baseAliases = AGENT_INPUT_NODE_ALIASES[node.type] || [node.type];
  for (const base of baseAliases) {
    push(base);
    push(`${base}${normalizedOrdinal}`);
    push(`${base} ${normalizedOrdinal}`);
  }

  return aliases;
}

function collectAvailableInputTargets(nodes: DynamicValue[] = []): InputTarget[] {
  const countsByType = new Map<string, number>();
  return nodes
    .filter(
      (node): node is WorkflowNode =>
        isPlainObject(node) &&
        typeof node.id === 'string' &&
        typeof node.type === 'string' &&
        ['textInput', 'imageInput', 'videoInput', 'audioInput', 'maskInput'].includes(node.type),
    )
    .map((node) => {
      const nextOrdinal = (countsByType.get(node.type) || 0) + 1;
      countsByType.set(node.type, nextOrdinal);
      const aliases = getInputNodeAliases(node, nextOrdinal);
      return {
        node,
        ordinal: nextOrdinal,
        aliases,
      };
    });
}

function resolveInputTarget(availableTargets: InputTarget[], rawKey: DynamicValue): InputTarget | null {
  const normalizedKey = normalizeLookupKey(rawKey);
  if (!normalizedKey) return null;
  return availableTargets.find((target) => target.aliases.has(normalizedKey)) || null;
}

function buildAvailableInputHint(availableTargets: InputTarget[]): string {
  return availableTargets
    .map(
      (target) =>
        `${target.node.id}${target.ordinal ? ` (候选别名: ${Array.from(target.aliases).slice(0, 4).join(', ')})` : ''}`,
    )
    .slice(0, 8)
    .join('; ');
}

function stringifyWorkflowInput(value: DynamicValue): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function resolveMediaOverride(value: DynamicValue, primaryKeys: string[]): PlainObject {
  if (typeof value === 'string') {
    return { fileUrl: cleanString(value, 4000) };
  }
  if (!isPlainObject(value)) return {};

  for (const key of primaryKeys) {
    const candidate = cleanString(value[key], 4000);
    if (candidate) {
      return {
        fileUrl: candidate,
        maskFileUrl: cleanString(value.maskFileUrl || value.maskUrl || value.mask, 4000),
        maskPreviewUrl: cleanString(value.maskPreviewUrl || value.maskFileUrl || value.maskUrl || value.mask, 4000),
      };
    }
  }

  return {
    fileUrl: '',
    maskFileUrl: cleanString(value.maskFileUrl || value.maskUrl || value.mask, 4000),
    maskPreviewUrl: cleanString(value.maskPreviewUrl || value.maskFileUrl || value.maskUrl || value.mask, 4000),
  };
}

function applyAgentInputOverrides(persistedWorkflow: PlainObject, rawInputs: DynamicValue) {
  if (!isPlainObject(rawInputs) || Object.keys(rawInputs).length === 0) {
    return { workflow: persistedWorkflow, appliedInputs: [], unmatchedInputs: [] };
  }

  const draftWorkflow = cloneWorkflow(persistedWorkflow);
  const appliedInputs: AppliedInput[] = [];
  const unmatchedInputs: string[] = [];
  const availableTargets = collectAvailableInputTargets(draftWorkflow.nodes);
  const nodeById = new Map<string, WorkflowNode>(
    draftWorkflow.nodes.map((node: DynamicValue) => {
      const normalizedNode = asWorkflowNode(node);
      return [normalizedNode.id, normalizedNode];
    }),
  );

  for (const [rawKey, value] of Object.entries(rawInputs)) {
    const resolvedTarget = resolveInputTarget(availableTargets, rawKey);
    if (!resolvedTarget) {
      unmatchedInputs.push(String(rawKey));
      continue;
    }
    const node = nodeById.get(resolvedTarget.node.id);
    if (!node) {
      unmatchedInputs.push(String(rawKey));
      continue;
    }

    if (node.type === 'textInput') {
      node.data.text = stringifyWorkflowInput(value);
      appliedInputs.push({ nodeId: node.id, nodeType: node.type, field: 'text', matchedBy: String(rawKey) });
      continue;
    }

    if (node.type === 'imageInput') {
      const override = resolveMediaOverride(value, ['fileUrl', 'url', 'image', 'imageUrl']);
      if (override.fileUrl) {
        node.data.fileUrl = override.fileUrl;
      }
      if (override.maskFileUrl) {
        node.data.maskFileUrl = override.maskFileUrl;
      }
      if (override.maskPreviewUrl) {
        node.data.maskPreviewUrl = override.maskPreviewUrl;
      }
      appliedInputs.push({ nodeId: node.id, nodeType: node.type, field: 'fileUrl', matchedBy: String(rawKey) });
      continue;
    }

    if (node.type === 'videoInput') {
      const override = resolveMediaOverride(value, ['fileUrl', 'url', 'video', 'videoUrl']);
      if (override.fileUrl) {
        node.data.fileUrl = override.fileUrl;
        appliedInputs.push({ nodeId: node.id, nodeType: node.type, field: 'fileUrl', matchedBy: String(rawKey) });
      }
      continue;
    }

    if (node.type === 'audioInput') {
      const override = resolveMediaOverride(value, ['fileUrl', 'url', 'audio', 'audioUrl']);
      if (override.fileUrl) {
        node.data.fileUrl = override.fileUrl;
        appliedInputs.push({ nodeId: node.id, nodeType: node.type, field: 'fileUrl', matchedBy: String(rawKey) });
      }
    }
  }

  if (appliedInputs.length === 0 && unmatchedInputs.length > 0) {
    throw new Error(
      `workflow.execute inputs did not match any input nodes. Unmatched: ${unmatchedInputs.join(', ')}. Available inputs: ${buildAvailableInputHint(availableTargets)}`,
    );
  }

  return {
    workflow: appliedInputs.length > 0 ? draftWorkflow : persistedWorkflow,
    appliedInputs,
    unmatchedInputs,
  };
}

function buildAgentWorkflowSummary(
  snapshot: PlainObject,
  terminalStatus: RunStatus,
  completedNodes: PlainObject[],
  extras: PlainObject = {},
) {
  const preferredNodes = completedNodes.filter((item) => item.nodeType === 'output');
  const keyNodes = (preferredNodes.length > 0 ? preferredNodes : completedNodes).slice(-3);
  const keyOutputs = keyNodes.map((item) => ({
    nodeId: item.nodeId,
    nodeType: item.nodeType,
    summary: item.summary,
    artifacts: collectWorkflowArtifacts(item.outputs).slice(0, 8),
  }));
  const artifacts = keyOutputs.flatMap((item) => item.artifacts || []).slice(0, 12);
  const summary = [
    `workflow "${snapshot.name || snapshot.workflowId}" finished with status ${terminalStatus.status}.`,
    terminalStatus.runId ? `runId: ${terminalStatus.runId}.` : '',
    Number.isFinite(terminalStatus.totalDuration) ? `durationMs: ${terminalStatus.totalDuration}.` : '',
    Number.isFinite(terminalStatus.successCount) ? `successCount: ${terminalStatus.successCount}.` : '',
    Number.isFinite(terminalStatus.failCount) ? `failCount: ${terminalStatus.failCount}.` : '',
    Array.isArray(extras.appliedInputs) && extras.appliedInputs.length
      ? `appliedInputs: ${extras.appliedInputs.map((item: DynamicValue) => item.nodeId).join(', ')}.`
      : '',
    keyOutputs.length > 0
      ? `keyOutputs: ${keyOutputs.map((item) => `${item.nodeId} (${item.nodeType}) => ${item.summary}`).join(' | ')}.`
      : '',
  ]
    .filter(Boolean)
    .join(' ');

  return {
    runId: terminalStatus.runId,
    workflowId: snapshot.workflowId,
    workflowName: snapshot.name,
    status: terminalStatus.status,
    source: snapshot.source,
    totalDuration: terminalStatus.totalDuration,
    successCount: terminalStatus.successCount,
    failCount: terminalStatus.failCount,
    error: terminalStatus.error,
    appliedInputs: extras.appliedInputs || [],
    keyOutputs,
    artifacts,
    summary,
  };
}

function buildRunLogData(event: string, data: DynamicValue) {
  if (
    event === WORKFLOW_SSE_EVENTS.NODE_COMPLETED &&
    data &&
    typeof data === 'object' &&
    data.logOutputs !== undefined
  ) {
    return {
      ...data,
      outputs: data.logOutputs,
    };
  }
  return data;
}

export class ExecutionService {
  repository: ExecutionRepository;
  runningExecutions: Map<string, RunningExecution>;
  recentExecutions: Map<string, RecentExecution>;

  constructor(repository: ExecutionRepository = workflowsRepository) {
    this.repository = repository;
    this.runningExecutions = new Map();
    this.recentExecutions = new Map();
  }

  getRun(runId: string): RunningExecution | null {
    return this.runningExecutions.get(runId) || null;
  }

  getStatus(runId: string, _options: PlainObject = {}) {
    this.pruneRecentExecutions();

    const run = this.getRun(runId);
    if (!run) {
      const recentRun = this.recentExecutions.get(runId);
      if (recentRun) {
        logger.info('execution status resolved from recent cache', {
          runId,
          processInstanceId: getProcessInstanceId(),
          status: recentRun.status?.status,
        });
        return recentRun.status;
      }
      logger.warn('execution status fell back to idle', {
        runId,
        processInstanceId: getProcessInstanceId(),
        runningExecutionCount: this.runningExecutions.size,
        recentExecutionCount: this.recentExecutions.size,
      });
      return { status: 'idle', runId };
    }

    logger.info('execution status resolved from active run', {
      runId,
      processInstanceId: getProcessInstanceId(),
      aborted: run.abortController.signal.aborted,
    });
    return {
      status: run.abortController.signal.aborted ? 'cancelled' : 'running',
      runId,
      workflowId: run.workflowId,
      source: run.source,
      snapshotVersion: run.snapshotVersion,
    };
  }

  cancel(runId: string, _options: PlainObject = {}) {
    const run = this.runningExecutions.get(runId);
    if (!run) {
      logger.warn('execution cancel ignored because run was missing', {
        runId,
        processInstanceId: getProcessInstanceId(),
      });
      return false;
    }
    logger.warn('execution cancel requested', {
      runId,
      workflowId: run.workflowId,
      processInstanceId: getProcessInstanceId(),
    });
    run.abortController.abort();
    return true;
  }

  pruneRecentExecutions(now = Date.now()) {
    for (const [runId, entry] of this.recentExecutions.entries()) {
      if (entry.expiresAt <= now) {
        this.recentExecutions.delete(runId);
      }
    }
  }

  rememberRecentExecution(status: RunStatus, now = Date.now()) {
    this.pruneRecentExecutions(now);
    this.recentExecutions.set(status.runId, {
      status,
      expiresAt: now + RECENT_RUN_TTL_MS,
    });
  }

  resolveWorkflowReference({ workflowId, workflowName }: PlainObject, _options: PlainObject = {}) {
    const normalizedId = cleanString(workflowId, 120);
    if (normalizedId) {
      return this.repository.read(normalizedId).workflow;
    }

    const normalizedName = normalizeForMatch(workflowName);
    if (!normalizedName) {
      throw new Error('workflow.execute requires workflowId or workflowName');
    }

    const workflows = this.repository.list();
    const exactMatch = workflows.find((workflow) => normalizeForMatch(workflow.name) === normalizedName);
    if (exactMatch) return exactMatch;

    const partialMatches = workflows.filter((workflow) => {
      const name = normalizeForMatch(workflow.name);
      const id = normalizeForMatch(workflow.id);
      return name.includes(normalizedName) || normalizedName.includes(name) || id === normalizedName;
    });

    if (partialMatches.length === 1) return partialMatches[0];
    if (partialMatches.length > 1) {
      throw new Error(
        `Multiple workflows matched "${workflowName}". Candidates: ${partialMatches
          .slice(0, 5)
          .map((workflow) => workflow.name || workflow.id)
          .join(', ')}`,
      );
    }

    throw new Error(`Workflow "${workflowName}" was not found.`);
  }

  async executeForAgent({
    workflowId,
    workflowName,
    inputs,
    apiConfig = {},
    signal,
    requestId = 'agent-workflow',
    onRunStarted = undefined,
    scope = undefined,
  }: PlainObject) {
    const persistedWorkflow = this.resolveWorkflowReference({ workflowId, workflowName }, { scope });
    const overridden = applyAgentInputOverrides(persistedWorkflow, inputs);
    const draftWorkflow = overridden.workflow === persistedWorkflow ? undefined : overridden.workflow;
    const snapshot = createExecutionSnapshot({ persistedWorkflow, draftWorkflow });
    const runLogger = createWorkflowRunLogger(snapshot, { requestId, scope });
    const abortController = new AbortController();
    const completedNodes: PlainObject[] = [];

    this.runningExecutions.set(snapshot.runId, {
      runId: snapshot.runId,
      workflowId: snapshot.workflowId,
      source: snapshot.source,
      snapshotVersion: snapshot.snapshotVersion,
      abortController,
    });
    onRunStarted?.({
      runId: snapshot.runId,
      workflowId: snapshot.workflowId,
      workflowName: snapshot.name,
      source: snapshot.source,
      workflowVersion: snapshot.workflowVersion,
      snapshotVersion: snapshot.snapshotVersion,
      appliedInputs: overridden.appliedInputs,
    });

    let terminalStatus: RunStatus | null = null;
    const sendSSE = (event: string, data: DynamicValue) => {
      runLogger.log(event, buildRunLogData(event, data));
      if (event === WORKFLOW_SSE_EVENTS.NODE_COMPLETED) {
        const node = Array.isArray(snapshot.nodes)
          ? snapshot.nodes.find((item: DynamicValue) => item.id === data.nodeId)
          : undefined;
        completedNodes.push({
          nodeId: data.nodeId,
          nodeType: node?.type || 'unknown',
          summary: summarizeNodeOutputs(data.outputs),
          outputs: data.outputs,
        });
      } else if (event === WORKFLOW_SSE_EVENTS.RUN_COMPLETED) {
        terminalStatus = {
          status: 'completed',
          runId: snapshot.runId,
          workflowId: snapshot.workflowId,
          source: snapshot.source,
          snapshotVersion: snapshot.snapshotVersion,
          finishedAt: Date.now(),
          totalDuration: data.totalDuration,
          successCount: data.successCount,
          failCount: data.failCount,
        };
      } else if (event === WORKFLOW_SSE_EVENTS.RUN_FAILED || event === WORKFLOW_SSE_EVENTS.VALIDATION_FAILED) {
        terminalStatus = {
          status: 'failed',
          runId: snapshot.runId,
          workflowId: snapshot.workflowId,
          source: snapshot.source,
          snapshotVersion: snapshot.snapshotVersion,
          finishedAt: Date.now(),
          error: data.error,
        };
      } else if (event === WORKFLOW_SSE_EVENTS.RUN_CANCELLED) {
        terminalStatus = {
          status: 'cancelled',
          runId: snapshot.runId,
          workflowId: snapshot.workflowId,
          source: snapshot.source,
          snapshotVersion: snapshot.snapshotVersion,
          finishedAt: Date.now(),
          error: data.error,
        };
      }
      return true;
    };

    const handleAbort = () => abortController.abort();
    signal?.addEventListener?.('abort', handleAbort, { once: true });

    try {
      await runWithRequestContext({ requestId, runId: runLogger.runId }, async () => {
        await executeWorkflow(snapshot, { ...apiConfig, abortSignal: abortController.signal }, sendSSE, {
          getNodeLogOutputs(outputs: DynamicValue) {
            return sanitizeNodeOutputsForLogs(outputs, runLogger);
          },
        });
      });
      if (!terminalStatus) {
        terminalStatus = {
          status: 'completed',
          runId: snapshot.runId,
          workflowId: snapshot.workflowId,
          source: snapshot.source,
          snapshotVersion: snapshot.snapshotVersion,
          finishedAt: Date.now(),
        };
      }
      runLogger.close(terminalStatus.status);
      return buildAgentWorkflowSummary(snapshot, terminalStatus, completedNodes, {
        appliedInputs: overridden.appliedInputs,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Workflow execution failed';
      terminalStatus = {
        status: abortController.signal.aborted ? 'cancelled' : 'failed',
        runId: snapshot.runId,
        workflowId: snapshot.workflowId,
        source: snapshot.source,
        snapshotVersion: snapshot.snapshotVersion,
        finishedAt: Date.now(),
        error: message,
      };
      runLogger.close(terminalStatus.status, { error: message });
      throw error;
    } finally {
      signal?.removeEventListener?.('abort', handleAbort);
      this.runningExecutions.delete(snapshot.runId);
      if (terminalStatus) {
        this.rememberRecentExecution(terminalStatus);
      }
    }
  }

  async execute(
    workflowId: string,
    body: PlainObject,
    res: SseResponse,
    requestId: string,
    _options: PlainObject = {},
  ) {
    const scope = _options.scope;
    const persistedWorkflow =
      body.source === 'draft'
        ? (() => {
            try {
              return this.repository.read(workflowId).workflow;
            } catch {
              return null;
            }
          })()
        : this.repository.read(workflowId).workflow;
    const draftWorkflow =
      body.source === 'draft'
        ? {
            ...(persistedWorkflow || {
              id: workflowId,
              name: cleanString(body.name, 200) || workflowId,
              version: 1,
              createdAt: Date.now(),
              updatedAt: Date.now(),
              settings: {},
            }),
            id: workflowId,
            name: cleanString(body.name, 200) || persistedWorkflow?.name || workflowId,
            nodes: body.nodes,
            edges: body.edges,
          }
        : undefined;
    const snapshot = createExecutionSnapshot({ persistedWorkflow, draftWorkflow });

    const runLogger = createWorkflowRunLogger(snapshot, { requestId, scope });
    const abortController = new AbortController();
    this.runningExecutions.set(snapshot.runId, {
      runId: snapshot.runId,
      workflowId,
      source: snapshot.source,
      snapshotVersion: snapshot.snapshotVersion,
      abortController,
    });
    logger.info('execution run registered', {
      runId: snapshot.runId,
      workflowId,
      source: snapshot.source,
      snapshotVersion: snapshot.snapshotVersion,
      processInstanceId: getProcessInstanceId(),
      runningExecutionCount: this.runningExecutions.size,
    });
    let terminalStatus: RunStatus | null = null;

    const sendSSE = (event: string, data: DynamicValue) => {
      runLogger.log(event, buildRunLogData(event, data));
      logger.info('workflow event', { runId: runLogger.runId, workflowId, event });
      if (event === WORKFLOW_SSE_EVENTS.RUN_COMPLETED) {
        terminalStatus = {
          status: 'completed',
          runId: snapshot.runId,
          workflowId: snapshot.workflowId,
          source: snapshot.source,
          snapshotVersion: snapshot.snapshotVersion,
          finishedAt: Date.now(),
          totalDuration: data.totalDuration,
          successCount: data.successCount,
          failCount: data.failCount,
        };
      } else if (event === WORKFLOW_SSE_EVENTS.RUN_FAILED || event === WORKFLOW_SSE_EVENTS.VALIDATION_FAILED) {
        terminalStatus = {
          status: 'failed',
          runId: snapshot.runId,
          workflowId: snapshot.workflowId,
          source: snapshot.source,
          snapshotVersion: snapshot.snapshotVersion,
          finishedAt: Date.now(),
          error: data.error,
        };
      } else if (event === WORKFLOW_SSE_EVENTS.RUN_CANCELLED) {
        terminalStatus = {
          status: 'cancelled',
          runId: snapshot.runId,
          workflowId: snapshot.workflowId,
          source: snapshot.source,
          snapshotVersion: snapshot.snapshotVersion,
          finishedAt: Date.now(),
          error: data.error,
        };
      }
      if (res.writableEnded) return false;
      try {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        return true;
      } catch {
        return false;
      }
    };

    sendSSE(WORKFLOW_SSE_EVENTS.RUN_LOG, { runId: runLogger.runId });
    sendSSE(WORKFLOW_SSE_EVENTS.SNAPSHOT_BUILT, {
      runId: snapshot.runId,
      workflowId: snapshot.workflowId,
      workflowVersion: snapshot.workflowVersion,
      snapshotVersion: snapshot.snapshotVersion,
      source: snapshot.source,
    });
    sendSSE(WORKFLOW_SSE_EVENTS.RUN_STARTED, {
      runId: snapshot.runId,
      workflowId: snapshot.workflowId,
      workflowVersion: snapshot.workflowVersion,
      snapshotVersion: snapshot.snapshotVersion,
      source: snapshot.source,
    });

    const apiConfig = settingsService.buildRuntimeConfig(body.apiConfig || {});

    try {
      await runWithRequestContext({ requestId, runId: runLogger.runId }, async () => {
        await executeWorkflow(snapshot, { ...apiConfig, abortSignal: abortController.signal }, sendSSE, {
          getNodeLogOutputs(outputs: DynamicValue) {
            return sanitizeNodeOutputsForLogs(outputs, runLogger);
          },
        });
      });
      runLogger.close('completed');
    } catch (error) {
      const message = error instanceof Error ? error.message : '执行引擎内部错误';
      sendSSE(abortController.signal.aborted ? WORKFLOW_SSE_EVENTS.RUN_CANCELLED : WORKFLOW_SSE_EVENTS.RUN_FAILED, {
        runId: snapshot.runId,
        status: abortController.signal.aborted ? 'cancelled' : 'error',
        error: message,
      });
      runLogger.close(abortController.signal.aborted ? 'cancelled' : 'error', { error: message });
    } finally {
      this.runningExecutions.delete(snapshot.runId);
      const completedStatus = terminalStatus as RunStatus | null;
      logger.info('execution run removed from active registry', {
        runId: snapshot.runId,
        workflowId,
        terminalStatus: completedStatus?.status ?? null,
        processInstanceId: getProcessInstanceId(),
        runningExecutionCount: this.runningExecutions.size,
      });
      if (completedStatus) {
        this.rememberRecentExecution(completedStatus);
        logger.info('execution terminal status cached', {
          runId: snapshot.runId,
          workflowId,
          terminalStatus: completedStatus.status,
          processInstanceId: getProcessInstanceId(),
          recentExecutionCount: this.recentExecutions.size,
        });
      }
      if (!res.writableEnded) {
        res.end();
      }
    }
  }
}

export const executionService = new ExecutionService();
