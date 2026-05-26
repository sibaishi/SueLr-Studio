import fs from 'fs';
import path from 'path';
import { STORAGE_PATHS } from '../storage/index.js';
import { ensureDir } from '../storage/ensure-dir.js';
import { getProcessInstanceId } from './runtime-observability.js';

const MAX_STRING_LENGTH = 2000;

function safeName(value) {
  return String(value || 'agent')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '-')
    .replace(/\s+/g, '_')
    .slice(0, 80);
}

function datePart(date) {
  return date.toISOString().slice(0, 10);
}

function timePart(date) {
  return date.toISOString().replace(/[:.]/g, '-');
}

function sanitizeValue(value, depth = 0) {
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
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, sanitizeValue(item, depth + 1)]),
    );
  }
  return value;
}

export function ensureAgentLogDirectories() {
  const root = path.join(STORAGE_PATHS.agentLogsDir, 'runs');
  ensureDir(STORAGE_PATHS.logsDir);
  ensureDir(STORAGE_PATHS.agentLogsDir);
  ensureDir(root);
  return { root };
}

export function createAgentRunLogger({ sessionId, conversationId, profileId, model, requestId, scope } = {}) {
  const now = new Date();
  const dirs = ensureAgentLogDirectories();
  const dayDir = path.join(dirs.root, datePart(now));
  ensureDir(dayDir);

  const safeSessionId = safeName(sessionId || 'session');
  const runId = sessionId || `${timePart(now)}_${safeSessionId}`;
  const filePath = path.join(dayDir, `${timePart(now)}_${safeSessionId}.jsonl`);

  const write = (event, data = {}) => {
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
    close(status, extra = {}) {
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
