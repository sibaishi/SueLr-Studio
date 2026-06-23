import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createLogger } from '../logging/logger.ts';
import { ensureDir } from './ensure-dir.ts';
import { safeResolveWithin } from './safe-path.ts';
import { type RequestScope, getScopedStoragePaths } from './scoped-storage.ts';

const logger = createLogger({ module: 'workflow-runtime-assets' });
type WorkflowRuntimeEntry = {
  generation: number;
  runDirectory: string;
  workflowKey: string;
  state: 'active' | 'retained';
};

const runtimeEntries = new Map<string, WorkflowRuntimeEntry>();
const retainedRunByWorkflow = new Map<string, string>();
const workflowGenerations = new Map<string, number>();
let startupCleanupCompleted = false;

function getScopeKey(scope: RequestScope = {}): string {
  return getScopedStoragePaths(scope).root;
}

function getRunKey(runId: string, scope: RequestScope = {}): string {
  return `${getScopeKey(scope)}\0${runId}`;
}

function getWorkflowKey(workflowId: string, scope: RequestScope = {}): string {
  return `${getScopeKey(scope)}\0${workflowId}`;
}

function getRunDirectory(runId: string, scope: RequestScope = {}): string {
  const digest = createHash('sha256').update(runId).digest('hex');
  return path.join(getScopedStoragePaths(scope).workflowRuntimeDir, digest);
}

function extensionFromMimeType(mimeType: string): string {
  const normalized = mimeType.toLowerCase();
  if (normalized === 'image/jpeg') return 'jpg';
  if (normalized === 'image/svg+xml') return 'svg';
  const subtype = normalized.split('/')[1]?.replace(/[^a-z0-9.+-]/g, '');
  return subtype === 'jpeg' ? 'jpg' : subtype || 'bin';
}

export function initializeWorkflowRuntimeStorage(): void {
  if (startupCleanupCompleted) return;
  startupCleanupCompleted = true;
  runtimeEntries.clear();
  retainedRunByWorkflow.clear();
  workflowGenerations.clear();
  const root = getScopedStoragePaths().workflowRuntimeDir;
  try {
    fs.rmSync(root, { recursive: true, force: true });
    ensureDir(root);
  } catch (error) {
    logger.warn('workflow runtime startup cleanup failed', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export function activateWorkflowRuntime(runId: string, workflowId: string, scope: RequestScope = {}): void {
  const workflowKey = getWorkflowKey(workflowId, scope);
  const generation = (workflowGenerations.get(workflowKey) || 0) + 1;
  workflowGenerations.set(workflowKey, generation);
  const retainedRunKey = retainedRunByWorkflow.get(workflowKey);
  if (retainedRunKey) {
    const retainedEntry = runtimeEntries.get(retainedRunKey);
    if (retainedEntry?.state === 'retained') {
      cleanupWorkflowRuntimeByKey(retainedRunKey, retainedEntry);
    }
  }

  const runDirectory = getRunDirectory(runId, scope);
  fs.rmSync(runDirectory, { recursive: true, force: true });
  ensureDir(runDirectory);
  runtimeEntries.set(getRunKey(runId, scope), {
    generation,
    runDirectory,
    workflowKey,
    state: 'active',
  });
}

export function retainWorkflowRuntime(runId: string, scope: RequestScope = {}): void {
  const runKey = getRunKey(runId, scope);
  const entry = runtimeEntries.get(runKey);
  if (!entry) return;

  const previousRetainedRunKey = retainedRunByWorkflow.get(entry.workflowKey);
  if (previousRetainedRunKey && previousRetainedRunKey !== runKey) {
    const previousEntry = runtimeEntries.get(previousRetainedRunKey);
    if (previousEntry?.state === 'retained') {
      if (previousEntry.generation > entry.generation) {
        cleanupWorkflowRuntimeByKey(runKey, entry);
        return;
      }
      cleanupWorkflowRuntimeByKey(previousRetainedRunKey, previousEntry);
    }
  }

  entry.state = 'retained';
  retainedRunByWorkflow.set(entry.workflowKey, runKey);
}

export function writeWorkflowRuntimeAsset(
  runId: string,
  buffer: Buffer,
  mimeType: string,
  scope: RequestScope = {},
): string {
  const entry = runtimeEntries.get(getRunKey(runId, scope));
  if (!entry || entry.state !== 'active') {
    throw new Error('工作流临时素材上下文不可用');
  }
  const filename = `${randomUUID()}.${extensionFromMimeType(mimeType)}`;
  const targetPath = safeResolveWithin(entry.runDirectory, filename);
  if (!targetPath) throw new Error('无法创建工作流临时素材');
  fs.writeFileSync(targetPath, buffer);
  return `/api/runtime/workflows/${encodeURIComponent(runId)}/${encodeURIComponent(filename)}`;
}

export function resolveWorkflowRuntimeAsset(
  runId: string,
  relativePath: string,
  scope: RequestScope = {},
): string | null {
  const entry = runtimeEntries.get(getRunKey(runId, scope));
  if (!entry) return null;
  const decodedPath = String(relativePath || '')
    .split('/')
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    })
    .join(path.sep);
  const targetPath = safeResolveWithin(entry.runDirectory, decodedPath);
  if (!targetPath || !fs.existsSync(targetPath) || !fs.statSync(targetPath).isFile()) return null;
  return targetPath;
}

export function resolveWorkflowRuntimeUrl(source: unknown, scope: RequestScope = {}): string | null {
  const value = String(source || '').trim();
  const match = value.match(/^\/api\/runtime\/workflows\/([^/]+)\/(.+)$/);
  if (!match) return null;
  let runId = match[1];
  try {
    runId = decodeURIComponent(runId);
  } catch {
    return null;
  }
  return resolveWorkflowRuntimeAsset(runId, match[2], scope);
}

export function cleanupWorkflowRuntime(runId: string, scope: RequestScope = {}): void {
  const key = getRunKey(runId, scope);
  const entry = runtimeEntries.get(key);
  cleanupWorkflowRuntimeByKey(key, entry, getRunDirectory(runId, scope), runId);
}

function cleanupWorkflowRuntimeByKey(
  runKey: string,
  entry?: WorkflowRuntimeEntry,
  fallbackDirectory?: string,
  runId?: string,
): void {
  runtimeEntries.delete(runKey);
  if (entry && retainedRunByWorkflow.get(entry.workflowKey) === runKey) {
    retainedRunByWorkflow.delete(entry.workflowKey);
  }
  const targetDirectory = entry?.runDirectory || fallbackDirectory;
  if (!targetDirectory) return;
  try {
    fs.rmSync(targetDirectory, { recursive: true, force: true });
  } catch (error) {
    logger.warn('workflow runtime cleanup failed', {
      runId: runId || runKey.split('\0').at(-1),
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
