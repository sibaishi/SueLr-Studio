import { agentRepository } from './agent.repository.js';
import { ensureResourceOwnership } from '../../platform/runtime/index.js';

export class AgentSessionStore {
  constructor(repository = agentRepository) {
    this.repository = repository;
    this.activeSessions = new Map();
  }

  create(session) {
    const next = ensureResourceOwnership({
      ...session,
      createdAt: session.createdAt || Date.now(),
      updatedAt: session.updatedAt || Date.now(),
    }, session.ownershipScope || session.scope);
    this.activeSessions.set(next.sessionId, next);
    this.repository.writeSessionFile(next.sessionId, next);
    return next;
  }

  update(sessionId, patch) {
    const current = this.get(sessionId);
    if (!current) return null;
    const next = ensureResourceOwnership({
      ...current,
      ...patch,
      updatedAt: Date.now(),
    }, current.ownershipScope || current.scope || patch.ownershipScope || patch.scope);
    this.activeSessions.set(sessionId, next);
    this.repository.writeSessionFile(sessionId, next);
    return next;
  }

  get(sessionId) {
    const session = this.activeSessions.get(sessionId) || this.repository.readSessionFile(sessionId);
    return session ? ensureResourceOwnership(session, session.ownershipScope || session.scope) : null;
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
