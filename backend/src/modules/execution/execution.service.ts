import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ConflictError, NotFoundError } from '../../app/errors/index.ts';
import { resolveRuntimeApiConfig } from '../../engine/helpers/apiConfig.ts';
import { recoverVideoResult } from '../../platform/ai/video-service.ts';
import { executeWorkflow } from '../../engine/executor.ts';
import { createLogger } from '../../platform/logging/logger.ts';
import { runWithRequestContext } from '../../platform/logging/request-context.ts';
import type { RequestScope } from '../../platform/runtime/request-scope.ts';
import { getProcessInstanceId } from '../../platform/logging/runtime-observability.ts';
import { WORKFLOW_SSE_EVENTS } from '../../platform/logging/workflow-events.ts';
import { sanitizeNodeOutputsForLogs } from '../../platform/logging/workflow-log-sanitizer.ts';
import { createWorkflowRunLogger } from '../../platform/logging/workflow-run-logger.ts';
import { getScopedStoragePaths, isResourceVisibleForScope } from '../../platform/storage/index.ts';
import { activateWorkflowRuntime, retainWorkflowRuntime } from '../../platform/storage/workflow-runtime-assets.ts';
import { settingsService } from '../settings/settings.service.ts';
import type { DynamicValue, PlainObject } from '../types.ts';
import { workflowsRepository } from '../workflows/workflows.repository.ts';
import {
  type ExecutionHistoryEntry,
  type VideoRecovery,
  collectExecutionOutputUrls,
  listExecutionHistory,
  publicExecutionHistory,
  readExecutionHistory,
  saveExecutionHistory,
} from './execution-history.ts';
import { createExecutionSnapshot } from './execution-snapshot.ts';

const logger = createLogger({ module: 'execution-service' });
const RECENT_RUN_TTL_MS = 5 * 60 * 1000;

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

function cleanString(value: DynamicValue, maxLength = 5000): string {
  if (value === undefined || value === null) return '';
  return String(value).trim().slice(0, maxLength);
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
  private recoveringRuns = new Set<string>();

  constructor(repository: ExecutionRepository = workflowsRepository) {
    this.repository = repository;
    this.runningExecutions = new Map();
    this.recentExecutions = new Map();
  }

  getRun(runId: string): RunningExecution | null {
    return this.runningExecutions.get(runId) || null;
  }

  listHistory(workflowId: string, options: PlainObject = {}) {
    return listExecutionHistory(workflowId, options.scope).map((entry) =>
      publicExecutionHistory(
        entry.status === 'running' && !this.getRun(entry.runId) ? { ...entry, status: 'interrupted' } : entry,
      ),
    );
  }

  async recoverVideo(runId: string, recoveryId: string, scope?: RequestScope) {
    const entry = readExecutionHistory(runId, scope);
    const recovery = entry?.videoRecoveries?.find((item) => item.id === recoveryId);
    if (!entry || !recovery || !isResourceVisibleForScope(entry, scope)) {
      throw new NotFoundError('VIDEO_RECOVERY_NOT_FOUND', '找不到可取回的视频任务。');
    }
    if (this.getRun(runId) || this.recoveringRuns.has(runId)) {
      throw new ConflictError('VIDEO_RECOVERY_BUSY', '当前运行或取回任务尚未结束。');
    }
    const apiConfig = settingsService.buildRuntimeConfig({}, scope);
    const config = resolveRuntimeApiConfig({}, apiConfig, recovery.model);
    if (config.baseUrl !== recovery.baseUrl || config.configId !== recovery.configId || !config.apiKey) {
      throw new ConflictError('VIDEO_RECOVERY_CONFIG_CHANGED', '请恢复该任务原来的模型连接后再取回视频。');
    }
    this.recoveringRuns.add(runId);
    try {
      const output = await recoverVideoResult({
        apiKey: config.apiKey,
        baseUrl: recovery.baseUrl,
        providerConfig: config.providerConfig,
        taskId: recovery.taskId,
        endpoint: recovery.endpoint,
        scope,
        signal: AbortSignal.timeout(45_000),
      });
      try {
        saveExecutionHistory({
          ...entry,
          outputs: [...entry.outputs, output],
          videoRecoveries: entry.videoRecoveries?.filter((item) => item.id !== recoveryId),
        }, scope);
      } catch (error) {
        const outputPath = path.join(getScopedStoragePaths(scope).generatedDir, output.slice('/api/outputs/'.length));
        fs.rmSync(outputPath, { force: true });
        throw error;
      }
      return { output };
    } finally {
      this.recoveringRuns.delete(runId);
    }
  }

  getStatus(runId: string, _options: PlainObject = {}) {
    this.pruneRecentExecutions();

    const run = this.getRun(runId);
    if (!run) {
      const recentRun = this.recentExecutions.get(runId);
      if (recentRun) {
        if (!isResourceVisibleForScope(recentRun, _options.scope)) {
          return { status: 'idle', runId };
        }
        logger.info('execution status resolved from recent cache', {
          runId,
          processInstanceId: getProcessInstanceId(),
          status: recentRun.status?.status,
        });
        return recentRun.status;
      }
      const entry = readExecutionHistory(runId, _options.scope);
      if (entry && isResourceVisibleForScope(entry, _options.scope)) {
        return entry.status === 'running'
          ? { ...publicExecutionHistory(entry), status: 'failed', error: '上次运行被后端重启中断。' }
          : publicExecutionHistory(entry);
      }
      logger.warn('execution status fell back to idle', {
        runId,
        processInstanceId: getProcessInstanceId(),
        runningExecutionCount: this.runningExecutions.size,
        recentExecutionCount: this.recentExecutions.size,
      });
      return { status: 'idle', runId };
    }

    if (!isResourceVisibleForScope(run, _options.scope)) {
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
    if (!isResourceVisibleForScope(run, _options.scope)) {
      logger.warn('execution cancel ignored because run is outside request scope', {
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

  rememberRecentExecution(status: RunStatus, scope: PlainObject = {}, now = Date.now()) {
    this.pruneRecentExecutions(now);
    this.recentExecutions.set(status.runId, {
      status,
      expiresAt: now + RECENT_RUN_TTL_MS,
    });
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
    activateWorkflowRuntime(snapshot.runId, snapshot.workflowId, scope);
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
    const startedAt = Date.now();
    const outputs = new Set<string>();
    const videoRecoveries: VideoRecovery[] = [];
    const upstreamTargets = new Set(snapshot.edges.map((edge: PlainObject) => edge.target));
    const inputs = snapshot.nodes
      .filter((node: PlainObject) => node.type === 'io' && !upstreamTargets.has(node.id))
      .slice(0, 50)
      .map((node: PlainObject) => {
        const content = [node.data?.fileUrl, ...[node.data?.content].flat(2)];
        return {
          nodeId: cleanString(node.id, 120),
          text: typeof node.data?.text === 'string' ? node.data.text.slice(0, 2000) : '',
          files: [...new Set<string>(content.filter((value: unknown) =>
            typeof value === 'string' && /^\/api\/(files|outputs)\//.test(value),
          ))].slice(0, 20),
        };
      });
    const history: ExecutionHistoryEntry = {
      runId: snapshot.runId,
      workflowId: snapshot.workflowId,
      source: snapshot.source,
      snapshotVersion: snapshot.snapshotVersion,
      status: 'running',
      startedAt,
      nodeCount: snapshot.nodes.length,
      failures: [],
      inputs,
      outputs: [],
    };
    const persistHistory = (entry: ExecutionHistoryEntry) => {
      try {
        saveExecutionHistory(entry, scope);
      } catch {
        logger.warn('execution history write failed', { runId: snapshot.runId });
      }
    };
    persistHistory(history);

    const sendSSE = (event: string, data: DynamicValue) => {
      runLogger.log(event, buildRunLogData(event, data));
      if (event === WORKFLOW_SSE_EVENTS.NODE_COMPLETED) collectExecutionOutputUrls(data.outputs, outputs);
      if (event === WORKFLOW_SSE_EVENTS.NODE_FAILED && history.failures.length < 100) {
        history.failures.push({ nodeId: cleanString(data.nodeId, 120), error: cleanString(data.error, 500) });
      }
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
      if (terminalStatus) {
        const totalDuration = terminalStatus.totalDuration ?? Date.now() - startedAt;
        terminalStatus.totalDuration = totalDuration;
        persistHistory({ ...history, ...terminalStatus, totalDuration, outputs: [...outputs], videoRecoveries });
        data = { ...data, totalDuration };
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

    try {
      const apiConfig = settingsService.buildRuntimeConfig(body.apiConfig || {}, scope);
      await runWithRequestContext({ requestId, runId: runLogger.runId }, async () => {
        await executeWorkflow(
          snapshot,
          {
            ...apiConfig,
            runId: snapshot.runId,
            scope,
            abortSignal: abortController.signal,
            recordVideoRecovery(task: Omit<VideoRecovery, 'id'>) {
              if (videoRecoveries.length < 100) videoRecoveries.push({ ...task, id: randomUUID() });
            },
          },
          sendSSE,
          {
            getNodeLogOutputs(outputs: DynamicValue) {
              return sanitizeNodeOutputsForLogs(outputs, runLogger);
            },
          },
        );
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
      retainWorkflowRuntime(snapshot.runId, scope);
      const completedStatus = terminalStatus as RunStatus | null;
      logger.info('execution run removed from active registry', {
        runId: snapshot.runId,
        workflowId,
        terminalStatus: completedStatus?.status ?? null,
        processInstanceId: getProcessInstanceId(),
        runningExecutionCount: this.runningExecutions.size,
      });
      if (completedStatus) {
        this.rememberRecentExecution(completedStatus, scope, Date.now());
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
