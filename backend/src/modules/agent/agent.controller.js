import { successEnvelope } from '../../app/http/envelope.js';
import { agentService } from './agent.service.js';

function writeSse(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

export class AgentController {
  getStatus(req, res) {
    res.json(successEnvelope(agentService.getStatus({ scope: req.scope })));
  }

  getProfiles(req, res) {
    res.json(successEnvelope(agentService.getProfiles({ scope: req.scope })));
  }

  saveProfiles(req, res) {
    res.json(successEnvelope(agentService.saveProfiles(req.body, { scope: req.scope })));
  }

  getMemories(req, res) {
    res.json(successEnvelope(agentService.getMemories({ scope: req.scope })));
  }

  importMemories(req, res) {
    res.json(successEnvelope(agentService.importMemories(req.body.memories, { scope: req.scope })));
  }

  deleteMemory(req, res) {
    res.json(successEnvelope(agentService.deleteMemory(req.params.id, { scope: req.scope })));
  }

  clearMemories(req, res) {
    res.json(successEnvelope(agentService.clearMemories({ scope: req.scope })));
  }

  getSession(req, res) {
    res.json(successEnvelope(agentService.getSession(req.params.sessionId, { scope: req.scope })));
  }

  cancelSession(req, res) {
    res.json(successEnvelope(agentService.cancelSession(req.params.sessionId, { scope: req.scope })));
  }

  async chat(req, res, next) {
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
          onSessionStarted: (payload) => writeSse(res, 'agent_session_started', payload),
          onToolCallStarted: (payload) => writeSse(res, 'agent_tool_call_started', payload),
          onWorkflowRunStarted: (payload) => writeSse(res, 'agent_workflow_run_started', payload),
          onToolCallCompleted: (payload) => writeSse(res, 'agent_tool_call_completed', payload),
          onMessageDelta: (payload) => writeSse(res, 'agent_message_delta', payload),
          onMessageCompleted: (payload) => {
            writeSse(res, 'agent_message_completed', payload);
            res.end();
          },
          onSessionFailed: (payload) => {
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
    } catch (error) {
      if (res.headersSent) {
        writeSse(res, 'agent_session_failed', {
          code: error?.code || 'AGENT_STREAM_FAILED',
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
