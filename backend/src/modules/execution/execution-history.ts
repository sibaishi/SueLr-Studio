import fs from 'node:fs';
import path from 'node:path';
import type { VideoResultTask } from '../../platform/ai/video-service.ts';
import type { RequestScope } from '../../platform/runtime/request-scope.ts';
import { getScopedStoragePaths } from '../../platform/storage/index.ts';
import { readJsonFile, writeJsonFile } from '../../platform/storage/json-store.ts';

export type VideoRecovery = VideoResultTask & { id: string; nodeId: string; model: string; configId?: string };

export type ExecutionHistoryEntry = {
  runId: string;
  workflowId: string;
  source: string;
  snapshotVersion: number;
  status: string;
  startedAt: number;
  finishedAt?: number;
  totalDuration?: number;
  error?: string;
  nodeCount: number;
  failures: { nodeId: string; error: string }[];
  outputs: string[];
  inputs?: { nodeId: string; text: string; files: string[] }[];
  videoRecoveries?: VideoRecovery[];
};

export function publicExecutionHistory({ videoRecoveries, ...entry }: ExecutionHistoryEntry) {
  return { ...entry, recoverableVideos: videoRecoveries?.map(({ id, nodeId }) => ({ id, nodeId })) ?? [] };
}

function directory(scope?: RequestScope) {
  return path.join(getScopedStoragePaths(scope).logsDir, 'workflow-history');
}

export function saveExecutionHistory(entry: ExecutionHistoryEntry, scope?: RequestScope) {
  writeJsonFile(path.join(directory(scope), `${entry.runId}.json`), entry);
}

export function readExecutionHistory(runId: string, scope?: RequestScope) {
  if (!/^[a-zA-Z0-9._:-]+$/.test(runId) || runId.startsWith('.')) return null;
  return readJsonFile<ExecutionHistoryEntry | null>(path.join(directory(scope), `${runId}.json`), null);
}

export function listExecutionHistory(workflowId: string, scope?: RequestScope) {
  const root = directory(scope);
  if (!fs.existsSync(root)) return [];
  const entries: ExecutionHistoryEntry[] = [];
  const files = fs.readdirSync(root).filter((file) => file.endsWith(`_${workflowId}.json`)).sort().reverse();
  for (const file of files) {
    const entry = readExecutionHistory(file.slice(0, -5), scope);
    if (entry?.workflowId !== workflowId) continue;
    entries.push(entry);
    if (entries.length === 30) break;
  }
  return entries;
}

export function collectExecutionOutputUrls(value: unknown, urls: Set<string>) {
  if (urls.size >= 100) return;
  if (typeof value === 'string') {
    if (value.startsWith('/api/outputs/')) urls.add(value);
  } else if (Array.isArray(value)) {
    for (const item of value) collectExecutionOutputUrls(item, urls);
  } else if (value && typeof value === 'object') {
    for (const item of Object.values(value)) collectExecutionOutputUrls(item, urls);
  }
}
