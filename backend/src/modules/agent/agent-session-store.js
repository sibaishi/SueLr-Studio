import { agentRepository } from './agent.repository.js';

export class AgentSessionStore {
  constructor(repository = agentRepository) {
    this.repository = repository;
    this.activeSessions = new Map();
  }

  create(session) {
    const next = {
      ...session,
      createdAt: session.createdAt || Date.now(),
      updatedAt: session.updatedAt || Date.now(),
    };
    this.activeSessions.set(next.sessionId, next);
    this.repository.writeSessionFile(next.sessionId, next);
    return next;
  }

  update(sessionId, patch) {
    const current = this.get(sessionId);
    if (!current) return null;
    const next = {
      ...current,
      ...patch,
      updatedAt: Date.now(),
    };
    this.activeSessions.set(sessionId, next);
    this.repository.writeSessionFile(sessionId, next);
    return next;
  }

  get(sessionId) {
    return this.activeSessions.get(sessionId) || this.repository.readSessionFile(sessionId);
  }

  list() {
    return Array.from(this.activeSessions.values());
  }

  cancel(sessionId) {
    const current = this.get(sessionId);
    if (!current) return null;
    return this.update(sessionId, {
      status: 'cancelled',
      lastRunStatus: 'cancelled',
      finishedAt: Date.now(),
    });
  }
}

export const agentSessionStore = new AgentSessionStore();
