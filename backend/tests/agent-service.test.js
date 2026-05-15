import test from 'node:test';
import assert from 'node:assert/strict';
import { AgentService } from '../src/modules/agent/agent.service.js';

function createSessionStore() {
  const sessions = new Map();
  return {
    create(session) {
      sessions.set(session.sessionId, session);
      return session;
    },
    update(sessionId, patch) {
      const current = sessions.get(sessionId);
      if (!current) return null;
      const next = { ...current, ...patch };
      sessions.set(sessionId, next);
      return next;
    },
    get(sessionId) {
      return sessions.get(sessionId) || null;
    },
    cancel(sessionId) {
      const current = sessions.get(sessionId);
      if (!current) return null;
      const next = {
        ...current,
        status: 'cancelled',
        lastRunStatus: 'cancelled',
        finishedAt: Date.now(),
      };
      sessions.set(sessionId, next);
      return next;
    },
    list() {
      return Array.from(sessions.values());
    },
  };
}

function createAgentService(runtime) {
  const sessionStore = createSessionStore();
  const service = new AgentService({
    runtime,
    sessionStore,
    settingsService: {
      buildRuntimeConfig(overrides = {}) {
        return overrides;
      },
    },
    capabilitiesService: {},
    executionService: {},
    memoryService: {},
    profileService: {},
    toolRegistry: {
      toModelTools: () => [],
      execute: async () => '',
    },
    repository: {},
  });
  return { service, sessionStore };
}

test('AgentService.chatStream marks timed-out sessions as failed and emits timeout event', async () => {
  let failedPayload = null;
  let sessionId = null;

  const { service, sessionStore } = createAgentService({
    async runStream({ options, handlers, signal }) {
      sessionId = options.sessionId;
      sessionStore.create({
        sessionId,
        conversationId: 'conv-timeout',
        profileId: 'default',
        model: 'demo-model',
        status: 'running',
        lastRunStatus: 'running',
      });
      handlers.onSessionStarted?.({ sessionId });
      await new Promise((resolve, reject) => {
        signal.addEventListener('abort', resolve, { once: true });
        setTimeout(() => reject(new Error('runStream should have been aborted by timeout')), 100);
      });
      throw new Error('aborted');
    },
  });

  service.chatStream(
    {
      conversationId: 'conv-timeout',
      model: 'demo-model',
      messages: [{ role: 'user', content: 'hello' }],
      options: { timeoutMs: 20 },
    },
    {
      onSessionFailed(payload) {
        failedPayload = payload;
      },
    },
  );

  await new Promise((resolve) => setTimeout(resolve, 80));

  assert.equal(failedPayload?.code, 'AGENT_SESSION_TIMEOUT');
  assert.match(String(failedPayload?.message || ''), /timed out/i);
  assert.ok(sessionId);
  const stored = service.getSession(sessionId);
  assert.equal(stored?.status, 'failed');
  assert.equal(stored?.lastRunStatus, 'failed');
  assert.equal(stored?.error?.code, 'AGENT_SESSION_TIMEOUT');
});

test('AgentService.chat surfaces timed-out sessions as 504 errors', async () => {
  const { service, sessionStore } = createAgentService({
    async run({ options, signal }) {
      sessionStore.create({
        sessionId: options.sessionId,
        conversationId: 'conv-timeout-sync',
        profileId: 'default',
        model: 'demo-model',
        status: 'running',
        lastRunStatus: 'running',
      });
      await new Promise((resolve) => signal.addEventListener('abort', resolve, { once: true }));
      throw new Error('aborted');
    },
  });

  await assert.rejects(
    service.chat({
      conversationId: 'conv-timeout-sync',
      model: 'demo-model',
      messages: [{ role: 'user', content: 'hello' }],
      options: { timeoutMs: 20 },
    }),
    (error) => {
      assert.equal(error?.status, 504);
      assert.equal(error?.code, 'AGENT_SESSION_TIMEOUT');
      return true;
    },
  );
});
