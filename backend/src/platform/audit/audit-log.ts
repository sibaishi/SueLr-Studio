import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { STORAGE_PATHS, ensureJsonFile, readJsonFile, writeJsonFile } from '../storage/index.ts';
import type { PlainObject } from '../../modules/types.ts';

export interface AuditLogEntry {
  id: string;
  action: string;
  createdAt: number;
  actorType: 'public' | 'admin' | 'system';
  actorId?: string;
  targetType?: string;
  targetId?: string;
  clientIp?: string;
  userAgent?: string;
  details?: PlainObject;
}

interface AuditLogState {
  entries: AuditLogEntry[];
}

const DEFAULT_AUDIT_STATE: AuditLogState = { entries: [] };
const MAX_AUDIT_ENTRIES = 1000;

function getAuditLogPath(): string {
  return path.join(STORAGE_PATHS.logsDir, 'audit-log.json');
}

function cleanString(value: unknown, maxLength = 500): string | undefined {
  const text = String(value || '').trim().slice(0, maxLength);
  return text || undefined;
}

function sanitizeDetails(value: PlainObject | undefined): PlainObject | undefined {
  if (!value) return undefined;
  const blocked = new Set(['password', 'passwordHash', 'token', 'tokenHash', 'sessionToken']);
  const result: PlainObject = {};
  for (const [key, item] of Object.entries(value)) {
    if (blocked.has(key)) continue;
    if (item === undefined) continue;
    if (item && typeof item === 'object') {
      result[key] = Array.isArray(item) ? item.slice(0, 20) : sanitizeDetails(item as PlainObject);
      continue;
    }
    result[key] = item;
  }
  return result;
}

export class AuditLog {
  list(limit = 200): AuditLogEntry[] {
    ensureJsonFile(getAuditLogPath(), DEFAULT_AUDIT_STATE);
    const state = readJsonFile<AuditLogState>(getAuditLogPath(), DEFAULT_AUDIT_STATE);
    const entries = Array.isArray(state.entries) ? state.entries : [];
    return entries
      .slice()
      .sort((a, b) => Number(b.createdAt) - Number(a.createdAt))
      .slice(0, Math.max(1, Math.min(1000, limit)));
  }

  write(input: Omit<AuditLogEntry, 'id' | 'createdAt'> & { createdAt?: number }): AuditLogEntry {
    ensureJsonFile(getAuditLogPath(), DEFAULT_AUDIT_STATE);
    const state = readJsonFile<AuditLogState>(getAuditLogPath(), DEFAULT_AUDIT_STATE);
    const entries = Array.isArray(state.entries) ? state.entries : [];
    const entry: AuditLogEntry = {
      id: `audit_${randomUUID()}`,
      action: cleanString(input.action, 160) || 'unknown',
      actorType: input.actorType,
      actorId: cleanString(input.actorId, 160),
      targetType: cleanString(input.targetType, 160),
      targetId: cleanString(input.targetId, 160),
      clientIp: cleanString(input.clientIp, 160),
      userAgent: cleanString(input.userAgent, 500),
      details: sanitizeDetails(input.details),
      createdAt: input.createdAt || Date.now(),
    };
    entries.push(entry);
    writeJsonFile(getAuditLogPath(), { entries: entries.slice(-MAX_AUDIT_ENTRIES) });
    return entry;
  }
}

export const auditLog = new AuditLog();
