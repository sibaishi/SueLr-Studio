import { executeWorkflow } from '../../../engine/executor.js';
import { createLogger } from '../../platform/logging/logger.js';
import { createWorkflowRunLogger } from '../../platform/logging/workflow-run-logger.js';
import { runWithRequestContext } from '../../platform/logging/request-context.js';
import { WORKFLOW_SSE_EVENTS } from '../../platform/logging/workflow-events.js';
import { settingsService } from '../settings/settings.service.js';
import { workflowsRepository } from '../workflows/workflows.repository.js';
import { createExecutionSnapshot } from './execution-snapshot.js';

const logger = createLogger({ module: 'execution-service' });

export class ExecutionService {
  constructor(repository = workflowsRepository) {
    this.repository = repository;
    this.runningExecutions = new Map();
  }

  getRun(runId) {
    return this.runningExecutions.get(runId) || null;
  }

  getStatus(runId) {
    const run = this.getRun(runId);
    if (!run) {
      return { status: 'idle', runId };
    }

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
    if (!run) return false;
    run.abortController.abort();
    return true;
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

    const sendSSE = (event, data) => {
      runLogger.log(event, data);
      logger.info('workflow event', { runId: runLogger.runId, workflowId, event });
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
      if (!res.writableEnded) {
        res.end();
      }
    }
  }
}

export const executionService = new ExecutionService();
