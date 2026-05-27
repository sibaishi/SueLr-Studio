import fs from 'node:fs';
import path from 'node:path';
import type { RequestScope } from '../runtime/request-scope.ts';
import { ensureDir } from '../storage/ensure-dir.ts';
import { STORAGE_PATHS } from '../storage/index.ts';
import { getProcessInstanceId } from './runtime-observability.ts';

const MAX_STRING_LENGTH = 2000;

type AgentRunStatus = 'completed' | 'cancelled' | 'failed' | string;
type JsonLike = unknown;
type LogData = Record<string, unknown>;

interface AgentRunLoggerOptions {
  sessionId?: string;
  conversationId?: string;
  profileId?: string;
  model?: string;
  requestId?: string;
  scope?: RequestScope;
}

export interface AgentLogDirectories {
  root: string;
}

export interface AgentRunLogger {
  runId: string;
  filePath: string;
  directory: string;
  log(event: string, data?: LogData): void;
  close(status: AgentRunStatus, extra?: LogData): void;
}

function safeName(value: unknown): string {
  return String(value || 'agent')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '-')
    .replace(/\s+/g, '_')
    .slice(0, 80);
}

function datePart(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function timePart(date: Date): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

function sanitizeValue(value: JsonLike, depth = 0): JsonLike {
  if (depth > 8) return '[MaxDepth]';
  if (typeof value === 'string') {
    if (/^data:[^;]+;base64,/i.test(value)) {
      return `${value.slice(0, 80)}...[data-url:${value.length} chars]`;
    }
    return value.length > MAX_STRING_LENGTH
      ? `${value.slice(0, MAX_STRING_LENGTH)}...[truncated:${value.length} chars]`
      : value;
  }
  if (Array.isArray(value)) return value.map((item) => sanitizeValue(item, depth + 1));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitizeValue(item, depth + 1)]));
  }
  return value;
}

export function ensureAgentLogDirectories(): AgentLogDirectories {
  const root = path.join(STORAGE_PATHS.agentLogsDir, 'runs');
  ensureDir(STORAGE_PATHS.logsDir);
  ensureDir(STORAGE_PATHS.agentLogsDir);
  ensureDir(root);
  return { root };
}

export function createAgentRunLogger({
  sessionId,
  conversationId,
  profileId,
  model,
  requestId,
  scope,
}: AgentRunLoggerOptions = {}): AgentRunLogger {
  const now = new Date();
  const dirs = ensureAgentLogDirectories();
  const dayDir = path.join(dirs.root, datePart(now));
  ensureDir(dayDir);

  const safeSessionId = safeName(sessionId || 'session');
  const runId = sessionId || `${timePart(now)}_${safeSessionId}`;
  const filePath = path.join(dayDir, `${timePart(now)}_${safeSessionId}.jsonl`);

  const write = (event: string, data: LogData = {}) => {
    const entry = {
      timestamp: new Date().toISOString(),
      event,
      runId,
      sessionId,
      conversationId,
      profileId,
      model,
      requestId,
      ownerUserId: scope?.userId,
      workspaceId: scope?.workspaceId,
      ownershipScope: scope,
      processInstanceId: getProcessInstanceId(),
      data: sanitizeValue(data),
    };
    fs.appendFileSync(filePath, `${JSON.stringify(entry)}\n`, 'utf8');
  };

  write('agent_run_started', {
    sessionId,
    conversationId,
    profileId,
    model,
  });

  return {
    runId,
    filePath,
    directory: dayDir,
    log: write,
    close(status: AgentRunStatus, extra: LogData = {}) {
      write(
        status === 'completed'
          ? 'agent_run_completed'
          : status === 'cancelled'
            ? 'agent_run_cancelled'
            : 'agent_run_failed',
        { status, ...extra },
      );
    },
  };
}
