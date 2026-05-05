import { executeWorkflow } from '../../../engine/executor.js';
import { createLogger } from '../../platform/logging/logger.js';
import { sanitizeNodeOutputsForLogs } from '../../platform/logging/workflow-log-sanitizer.js';
import { createWorkflowRunLogger } from '../../platform/logging/workflow-run-logger.js';
import { runWithRequestContext } from '../../platform/logging/request-context.js';
import { WORKFLOW_SSE_EVENTS } from '../../platform/logging/workflow-events.js';
import { getProcessInstanceId } from '../../platform/logging/runtime-observability.js';
import { settingsService } from '../settings/settings.service.js';
import { workflowsRepository } from '../workflows/workflows.repository.js';
import { createExecutionSnapshot } from './execution-snapshot.js';

const logger = createLogger({ module: 'execution-service' });
const RECENT_RUN_TTL_MS = 5 * 60 * 1000;

export class ExecutionService {
  constructor(repository = workflowsRepository) {
    this.repository = repository;
    this.runningExecutions = new Map();
    this.recentExecutions = new Map();
  }

  getRun(runId) {
    return this.runningExecutions.get(runId) || null;
  }

  getStatus(runId) {
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

  cancel(runId) {
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

  rememberRecentExecution(status, now = Date.now()) {
    this.pruneRecentExecutions(now);
    this.recentExecutions.set(status.runId, {
      status,
      expiresAt: now + RECENT_RUN_TTL_MS,
    });
  }

  async execute(workflowId, body, res, requestId) {
    const persistedWorkflow = this.repository.read(workflowId).workflow;
    const draftWorkflow = body.source === 'draft'
      ? {
          ...persistedWorkflow,
          nodes: body.nodes,
          edges: body.edges,
        }
      : undefined;
    const snapshot = createExecutionSnapshot({ persistedWorkflow, draftWorkflow });

    const runLogger = createWorkflowRunLogger(snapshot, { requestId });
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
    let terminalStatus = null;

    const sendSSE = (event, data) => {
      runLogger.log(event, data);
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

    sendSSE(WORKFLOW_SSE_EVENTS.RUN_LOG, { runId: runLogger.runId, path: runLogger.filePath });
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
        await executeWorkflow(
          snapshot,
          { ...apiConfig, abortSignal: abortController.signal },
          sendSSE,
          {
            getNodeLogOutputs(outputs) {
              return sanitizeNodeOutputsForLogs(outputs, runLogger);
            },
          },
        );
      });
      runLogger.close('completed');
    } catch (error) {
      const message = error instanceof Error ? error.message : '执行引擎内部错误';
      sendSSE(
        abortController.signal.aborted ? WORKFLOW_SSE_EVENTS.RUN_CANCELLED : WORKFLOW_SSE_EVENTS.RUN_FAILED,
        {
          runId: snapshot.runId,
          status: abortController.signal.aborted ? 'cancelled' : 'error',
          error: message,
        },
      );
      runLogger.close(abortController.signal.aborted ? 'cancelled' : 'error', { error: message });
    } finally {
      this.runningExecutions.delete(snapshot.runId);
      logger.info('execution run removed from active registry', {
        runId: snapshot.runId,
        workflowId,
        terminalStatus: terminalStatus?.status ?? null,
        processInstanceId: getProcessInstanceId(),
        runningExecutionCount: this.runningExecutions.size,
      });
      if (terminalStatus) {
        this.rememberRecentExecution(terminalStatus);
        logger.info('execution terminal status cached', {
          runId: snapshot.runId,
          workflowId,
          terminalStatus: terminalStatus.status,
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
