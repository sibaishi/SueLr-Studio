import { randomUUID } from 'node:crypto';
import { AppError, ValidationError, fromLegacyError } from '../../app/errors/index.ts';
import { createAgentRunLogger } from '../../platform/logging/agent-run-logger.ts';
import { createLogger } from '../../platform/logging/logger.ts';
import { getRequestContext } from '../../platform/logging/request-context.ts';
import { capabilitiesService } from '../capabilities/capabilities.service.ts';
import { executionService } from '../execution/execution.service.ts';
import { settingsService } from '../settings/settings.service.ts';
import type { DynamicValue, PlainObject } from '../types.ts';
import { agentMemoryService } from './agent-memory.service.ts';
import { agentProfileService } from './agent-profile.service.ts';
import { AgentRuntime } from './agent-runtime.ts';
import { agentSessionStore } from './agent-session-store.ts';
import { agentRepository } from './agent.repository.ts';
import { createToolRegistry } from './tool-registry.ts';

const logger = createLogger({ module: 'agent-service' });
const DEFAULT_AGENT_SESSION_TIMEOUT_MS = 5 * 60 * 1000;

type RunningSession = {
  abortController: AbortController;
  timeoutMs: number;
  didTimeout: () => boolean;
  clearTimeout: () => void;
};

function resolveSessionTimeoutMs(options: DynamicValue = {}): number {
  const value = Number(options?.timeoutMs);
  if (!Number.isFinite(value) || value <= 0) {
    return DEFAULT_AGENT_SESSION_TIMEOUT_MS;
  }
  return Math.round(value);
}

export class AgentService {
  settingsService;
  capabilitiesService;
  executionService;
  memoryService;
  profileService;
  sessionStore;
  toolRegistry;
  runtime;
  repository;
  runningSessions: Map<string, RunningSession>;

  constructor(deps: PlainObject = {}) {
    this.settingsService = deps.settingsService || settingsService;
    this.capabilitiesService = deps.capabilitiesService || capabilitiesService;
    this.executionService = deps.executionService || executionService;
    this.memoryService = deps.memoryService || agentMemoryService;
    this.profileService = deps.profileService || agentProfileService;
    this.sessionStore = deps.sessionStore || agentSessionStore;
    this.toolRegistry =
      deps.toolRegistry ||
      createToolRegistry({
        capabilitiesService: this.capabilitiesService,
        memoryService: this.memoryService,
        executionService: this.executionService,
      });
    this.runtime =
      deps.runtime ||
      new AgentRuntime({
        capabilitiesService: this.capabilitiesService,
        profileService: this.profileService,
        memoryService: this.memoryService,
        toolRegistry: this.toolRegistry,
        sessionStore: this.sessionStore,
      });
    this.repository = deps.repository || agentRepository;
    this.runningSessions = new Map();
  }

  createRunningSession(sessionId: string, options: PlainObject = {}) {
    const abortController = new AbortController();
    const timeoutMs = resolveSessionTimeoutMs(options);
    let timedOut = false;
    const timeoutId = setTimeout(() => {
      timedOut = true;
      abortController.abort();
    }, timeoutMs);
    timeoutId.unref?.();

    const runningSession = {
      abortController,
      timeoutMs,
      didTimeout: () => timedOut,
      clearTimeout: () => clearTimeout(timeoutId),
    };
    this.runningSessions.set(sessionId, runningSession);
    return runningSession;
  }

  finalizeSessionFailure(sessionId: string, error: unknown, runningSession?: RunningSession) {
    const existing = this.sessionStore.get(sessionId);
    if (!existing) return;
    if (existing.status === 'completed' || existing.status === 'cancelled' || existing.status === 'failed') {
      return;
    }

    if (runningSession?.didTimeout?.()) {
      this.sessionStore.update(sessionId, {
        status: 'failed',
        lastRunStatus: 'failed',
        finishedAt: Date.now(),
        error: {
          code: 'AGENT_SESSION_TIMEOUT',
          message: `Agent session timed out after ${runningSession.timeoutMs}ms`,
        },
      });
      return;
    }

    if (runningSession?.abortController?.signal?.aborted) {
      this.sessionStore.cancel(sessionId);
      return;
    }

    this.sessionStore.update(sessionId, {
      status: 'failed',
      lastRunStatus: 'failed',
      finishedAt: Date.now(),
      error: {
        code: (error as DynamicValue)?.code || 'AGENT_RUN_FAILED',
        message: error instanceof Error ? error.message : String(error),
      },
    });
  }

  toPublicError(error: unknown, runningSession?: RunningSession) {
    if (runningSession?.didTimeout?.()) {
      return new AppError(504, 'AGENT_SESSION_TIMEOUT', `Agent session timed out after ${runningSession.timeoutMs}ms`);
    }
    return fromLegacyError(error);
  }

  getStatus(_options: PlainObject = {}) {
    return { ok: true, version: '1.0.0', sessions: this.sessionStore.list(_options).length };
  }

  getProfiles(_options: PlainObject = {}) {
    try {
      return this.profileService.getProfiles(_options);
    } catch (error) {
      throw fromLegacyError(error);
    }
  }

  saveProfiles(profiles: DynamicValue[], _options: PlainObject = {}) {
    try {
      return this.profileService.saveProfiles(profiles, _options);
    } catch (error) {
      throw fromLegacyError(error);
    }
  }

  getMemories(_options: PlainObject = {}) {
    try {
      return this.memoryService.list(_options);
    } catch (error) {
      throw fromLegacyError(error);
    }
  }

  importMemories(memories: DynamicValue[], _options: PlainObject = {}) {
    try {
      return this.memoryService.import(memories, _options);
    } catch (error) {
      throw fromLegacyError(error);
    }
  }

  deleteMemory(id: string, _options: PlainObject = {}) {
    try {
      return this.memoryService.delete(id, _options);
    } catch (error) {
      throw fromLegacyError(error);
    }
  }

  clearMemories(_options: PlainObject = {}) {
    try {
      return this.memoryService.clear(_options);
    } catch (error) {
      throw fromLegacyError(error);
    }
  }

  getSession(sessionId: string, _options: PlainObject = {}) {
    try {
      return this.sessionStore.get(sessionId, _options);
    } catch (error) {
      throw fromLegacyError(error);
    }
  }

  cancelSession(sessionId: string, _options: PlainObject = {}) {
    try {
      const runningSession = this.runningSessions.get(sessionId);
      if (runningSession) {
        runningSession.abortController.abort();
      }
      const existing = this.sessionStore.get(sessionId, _options);
      if (!existing) {
        throw new ValidationError('AGENT_SESSION_NOT_FOUND', 'Session not found');
      }
      return this.sessionStore.cancel(sessionId, _options);
    } catch (error) {
      throw fromLegacyError(error);
    }
  }

  async chat(body: PlainObject, options: PlainObject = {}) {
    const sessionId = body.sessionId || randomUUID();
    const runningSession = this.createRunningSession(sessionId, body.options);
    const { abortController } = runningSession;
    const runLogger = createAgentRunLogger({
      sessionId,
      conversationId: body.conversationId,
      profileId: body.profileId,
      model: body.model,
      requestId: getRequestContext()?.requestId,
      scope: options.scope,
    });
    runLogger.log('agent_request_received', {
      messageCount: Array.isArray(body.messages) ? body.messages.length : 0,
      attachmentCount: Array.isArray(body.attachments) ? body.attachments.length : 0,
      options: body.options || {},
    });
    try {
      const result = await this.runtime.run({
        conversationId: body.conversationId,
        profileId: body.profileId,
        model: body.model,
        messages: body.messages,
        options: {
          ...body.options,
          sessionId,
          apiConfig: this.settingsService.buildRuntimeConfig(body.apiConfig || {}, options.scope),
          scope: options.scope,
        },
        signal: abortController.signal,
      });
      const resultWithLog = {
        ...result,
        agentRunLog: {
          runId: runLogger.runId,
        },
      };
      this.sessionStore.update(sessionId, {
        agentRunLog: resultWithLog.agentRunLog,
      });
      runLogger.close('completed', {
        toolTraceCount: result.toolTrace?.length || 0,
        memoryWriteCount: result.memoryWrites?.length || 0,
      });
      logger.info('agent session completed', {
        sessionId: result.sessionId,
        conversationId: result.conversationId,
        profileId: result.profileId,
        model: result.model,
      });
      return resultWithLog;
    } catch (error: unknown) {
      this.finalizeSessionFailure(sessionId, error, runningSession);
      runLogger.close(abortController.signal.aborted ? 'cancelled' : 'failed', {
        code: (error as DynamicValue)?.code || 'AGENT_RUN_FAILED',
        message: error instanceof Error ? error.message : String(error),
      });
      logger.error('agent chat failed', {
        code: (error as DynamicValue)?.code,
        message: (error as DynamicValue)?.message,
      });
      throw this.toPublicError(error, runningSession);
    } finally {
      runningSession.clearTimeout();
      this.runningSessions.delete(sessionId);
    }
  }

  chatStream(body: PlainObject, handlers: PlainObject = {}) {
    const sessionId = body.sessionId || randomUUID();
    const runningSession = this.createRunningSession(sessionId, body.options);
    const { abortController } = runningSession;
    const runLogger = createAgentRunLogger({
      sessionId,
      conversationId: body.conversationId,
      profileId: body.profileId,
      model: body.model,
      requestId: getRequestContext()?.requestId,
      scope: handlers.scope,
    });
    runLogger.log('agent_request_received', {
      messageCount: Array.isArray(body.messages) ? body.messages.length : 0,
      attachmentCount: Array.isArray(body.attachments) ? body.attachments.length : 0,
      options: body.options || {},
    });
    let runClosed = false;
    const closeRunLog = (status: string, extra: PlainObject = {}) => {
      if (runClosed) return;
      runClosed = true;
      runLogger.close(status, extra);
    };
    const loggedHandlers = {
      ...handlers,
      onSessionStarted: (payload: DynamicValue) => {
        const next = {
          ...payload,
          agentRunLog: {
            runId: runLogger.runId,
          },
        };
        runLogger.log('agent_session_started', next);
        this.sessionStore.update(sessionId, { agentRunLog: next.agentRunLog });
        handlers.onSessionStarted?.(next);
      },
      onToolCallStarted: (payload: DynamicValue) => {
        runLogger.log('agent_tool_call_started', payload);
        handlers.onToolCallStarted?.(payload);
      },
      onWorkflowRunStarted: (payload: DynamicValue) => {
        runLogger.log('agent_workflow_run_started', payload);
        handlers.onWorkflowRunStarted?.(payload);
      },
      onToolCallCompleted: (payload: DynamicValue) => {
        runLogger.log('agent_tool_call_completed', payload);
        handlers.onToolCallCompleted?.(payload);
      },
      onMessageDelta: (payload: DynamicValue) => {
        runLogger.log('agent_message_delta', { deltaLength: String(payload?.delta || '').length });
        handlers.onMessageDelta?.(payload);
      },
      onMessageCompleted: (payload: DynamicValue) => {
        const next = {
          ...payload,
          agentRunLog: {
            runId: runLogger.runId,
          },
        };
        runLogger.log('agent_message_completed', next);
        closeRunLog('completed', {
          toolTraceCount: next.toolTrace?.length || 0,
          memoryWriteCount: next.memoryWrites?.length || 0,
        });
        handlers.onMessageCompleted?.(next);
      },
      onSessionFailed: (payload: DynamicValue) => {
        runLogger.log('agent_session_failed', payload);
        closeRunLog(abortController.signal.aborted ? 'cancelled' : 'failed', payload);
        handlers.onSessionFailed?.(payload);
      },
    };

    void this.runtime
      .runStream({
        conversationId: body.conversationId,
        profileId: body.profileId,
        model: body.model,
        messages: body.messages,
        options: {
          ...body.options,
          sessionId,
          apiConfig: this.settingsService.buildRuntimeConfig(body.apiConfig || {}, handlers.scope),
          scope: handlers.scope,
        },
        signal: abortController.signal,
        handlers: loggedHandlers,
      })
      .catch((error: unknown) => {
        this.finalizeSessionFailure(sessionId, error, runningSession);
        const normalizedError = error as DynamicValue;
        logger.error('agent chat stream failed', { code: normalizedError?.code, message: normalizedError?.message });
        loggedHandlers.onSessionFailed?.({
          sessionId,
          code: runningSession.didTimeout() ? 'AGENT_SESSION_TIMEOUT' : normalizedError?.code || 'AGENT_STREAM_FAILED',
          message: runningSession.didTimeout()
            ? `Agent session timed out after ${runningSession.timeoutMs}ms`
            : error instanceof Error
              ? error.message
              : String(error),
        });
      })
      .finally(() => {
        runningSession.clearTimeout();
        this.runningSessions.delete(sessionId);
      });

    return () => {
      const runningSession = this.runningSessions.get(sessionId);
      if (runningSession) {
        runningSession.abortController.abort();
      }
    };
  }
}

export const agentService = new AgentService();
