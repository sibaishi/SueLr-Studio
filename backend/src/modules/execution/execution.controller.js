import { successEnvelope } from '../../app/http/envelope.js';
import { createLogger } from '../../platform/logging/logger.js';
import { getProcessInstanceId } from '../../platform/logging/runtime-observability.js';
import { executionService } from './execution.service.js';

const logger = createLogger({ module: 'execution-controller' });

function interceptRunIdFromChunk(chunk) {
  const payload = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
  const match = payload.match(/event: workflow_snapshot_built\ndata: (.+?)\n\n/s);
  if (!match) return null;

  try {
    const data = JSON.parse(match[1]);
    return typeof data.runId === 'string' ? data.runId : null;
  } catch {
    return null;
  }
}

export class ExecutionController {
  async execute(req, res, next) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const workflowId = req.params.id;
    let activeRunId = null;
    let hasLoggedRunAssociation = false;
    const heartbeat = setInterval(() => {
      if (res.writableEnded) {
        clearInterval(heartbeat);
        return;
      }
      res.write(': heartbeat\n\n');
    }, 15000);

    res.on('close', () => {
      clearInterval(heartbeat);
      logger.warn('execution SSE connection closed', {
        activeRunId,
        processInstanceId: getProcessInstanceId(),
        writableEnded: res.writableEnded,
      });
      if (activeRunId) {
        executionService.cancel(activeRunId);
      }
    });

    try {
      const originalWrite = res.write.bind(res);
      res.write = (chunk, encoding, callback) => {
        activeRunId = interceptRunIdFromChunk(chunk) || activeRunId;
        if (activeRunId && !hasLoggedRunAssociation) {
          hasLoggedRunAssociation = true;
          logger.info('execution SSE stream associated with run', {
            activeRunId,
            processInstanceId: getProcessInstanceId(),
          });
        }
        return originalWrite(chunk, encoding, callback);
      };
      await executionService.execute(workflowId, req.body, res, req.requestId);
    } catch (error) {
      clearInterval(heartbeat);
      if (!res.writableEnded) {
        res.write(`event: workflow_error\ndata: ${JSON.stringify({ error: error instanceof Error ? error.message : '执行引擎内部错误' })}\n\n`);
        res.end();
      }
      next(error);
      return;
    }

    clearInterval(heartbeat);
  }

  getStatus(req, res) {
    res.json(successEnvelope(executionService.getStatus(req.params.runId)));
  }

  cancel(req, res) {
    const cancelled = executionService.cancel(req.params.runId);
    res.json(successEnvelope({ runId: req.params.runId, message: cancelled ? '已取消执行' : '没有正在执行的任务' }));
  }
}

export const executionController = new ExecutionController();
