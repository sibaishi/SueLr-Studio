import { ensureResourceOwnership } from '../../platform/runtime/index.ts';
import type { DynamicValue, PlainObject } from '../types.ts';
import { agentRepository } from './agent.repository.ts';

export class AgentSessionStore {
  repository;
  activeSessions: Map<string, PlainObject>;

  constructor(repository = agentRepository) {
    this.repository = repository;
    this.activeSessions = new Map();
  }

  create(session: PlainObject) {
    const next = ensureResourceOwnership(
      {
        ...session,
        createdAt: session.createdAt || Date.now(),
        updatedAt: session.updatedAt || Date.now(),
      },
      session.ownershipScope || session.scope,
    );
    const sessionId = String((next as DynamicValue).sessionId || '');
    this.activeSessions.set(sessionId, next);
    this.repository.writeSessionFile(sessionId, next);
    return next;
  }

  update(sessionId: string, patch: PlainObject) {
    const current = this.get(sessionId);
    if (!current) return null;
    const next = ensureResourceOwnership(
      {
        ...current,
        ...patch,
        updatedAt: Date.now(),
      },
      current.ownershipScope || current.scope || patch.ownershipScope || patch.scope,
    );
    this.activeSessions.set(sessionId, next);
    this.repository.writeSessionFile(sessionId, next);
    return next;
  }

  get(sessionId: string): PlainObject | null {
    const session = this.activeSessions.get(sessionId) || this.repository.readSessionFile(sessionId);
    return session ? ensureResourceOwnership(session, session.ownershipScope || session.scope) : null;
  }

  list() {
    return Array.from(this.activeSessions.values());
  }

  cancel(sessionId: string) {
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
