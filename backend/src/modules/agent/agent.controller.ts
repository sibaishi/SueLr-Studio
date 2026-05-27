import { successEnvelope } from '../../app/http/envelope.ts';
import type { DynamicValue, NextFunctionLike, RequestLike, ResponseLike } from '../types.ts';
import { agentService } from './agent.service.ts';

function writeSse(res: ResponseLike, event: string, data: DynamicValue) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

export class AgentController {
  getStatus(req: RequestLike, res: ResponseLike) {
    res.json(successEnvelope(agentService.getStatus({ scope: req.scope })));
  }

  getProfiles(req: RequestLike, res: ResponseLike) {
    res.json(successEnvelope(agentService.getProfiles({ scope: req.scope })));
  }

  saveProfiles(req: RequestLike, res: ResponseLike) {
    res.json(successEnvelope(agentService.saveProfiles(req.body, { scope: req.scope })));
  }

  getMemories(req: RequestLike, res: ResponseLike) {
    res.json(successEnvelope(agentService.getMemories({ scope: req.scope })));
  }

  importMemories(req: RequestLike, res: ResponseLike) {
    res.json(successEnvelope(agentService.importMemories(req.body.memories, { scope: req.scope })));
  }

  deleteMemory(req: RequestLike, res: ResponseLike) {
    res.json(successEnvelope(agentService.deleteMemory(req.params.id, { scope: req.scope })));
  }

  clearMemories(req: RequestLike, res: ResponseLike) {
    res.json(successEnvelope(agentService.clearMemories({ scope: req.scope })));
  }

  getSession(req: RequestLike, res: ResponseLike) {
    res.json(successEnvelope(agentService.getSession(req.params.sessionId, { scope: req.scope })));
  }

  cancelSession(req: RequestLike, res: ResponseLike) {
    res.json(successEnvelope(agentService.cancelSession(req.params.sessionId, { scope: req.scope })));
  }

  async chat(req: RequestLike, res: ResponseLike, next: NextFunctionLike) {
    try {
      if (req.query.stream === 'true' || req.body.options?.stream === true) {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
          'X-Accel-Buffering': 'no',
        });

        const cleanup = agentService.chatStream(req.body, {
          scope: req.scope,
          onSessionStarted: (payload: DynamicValue) => writeSse(res, 'agent_session_started', payload),
          onToolCallStarted: (payload: DynamicValue) => writeSse(res, 'agent_tool_call_started', payload),
          onWorkflowRunStarted: (payload: DynamicValue) => writeSse(res, 'agent_workflow_run_started', payload),
          onToolCallCompleted: (payload: DynamicValue) => writeSse(res, 'agent_tool_call_completed', payload),
          onMessageDelta: (payload: DynamicValue) => writeSse(res, 'agent_message_delta', payload),
          onMessageCompleted: (payload: DynamicValue) => {
            writeSse(res, 'agent_message_completed', payload);
            res.end();
          },
          onSessionFailed: (payload: DynamicValue) => {
            writeSse(res, 'agent_session_failed', payload);
            res.end();
          },
        });

        res.on('close', () => {
          cleanup?.();
        });
        return;
      }

      const result = await agentService.chat(req.body, { scope: req.scope });
      res.json(successEnvelope(result));
    } catch (error: unknown) {
      const normalizedError = error as DynamicValue;
      if (res.headersSent) {
        writeSse(res, 'agent_session_failed', {
          code: normalizedError?.code || 'AGENT_STREAM_FAILED',
          message: error instanceof Error ? error.message : String(error),
        });
        res.end();
        return;
      }
      next(error);
    }
  }
}

export const agentController = new AgentController();
