import fs from 'node:fs';
import path from 'node:path';
import type { RequestScope } from '../runtime/request-scope.ts';
import { ensureDir } from '../storage/ensure-dir.ts';
import { STORAGE_PATHS } from '../storage/index.ts';
import { logDatePart, logTimePart, sanitizeLogFilePart } from './log-file-names.ts';
import { getProcessInstanceId } from './runtime-observability.ts';

type WorkflowRunStatus = 'completed' | 'cancelled' | 'failed' | string;
type LogData = Record<string, unknown>;

interface WorkflowLogInput {
  runId?: string;
  id?: unknown;
  workflowId?: unknown;
  name?: unknown;
  workflowName?: unknown;
  scope?: unknown;
  snapshotVersion?: unknown;
  source?: unknown;
  workflowVersion?: unknown;
  nodes?: unknown;
  edges?: unknown;
}

interface WorkflowRunContext {
  requestId?: string;
  scope?: RequestScope;
}

export interface LogDirectories {
  root: string;
  runtime: string;
  workflows: string;
  startup: string;
}

export interface WorkflowRunLogger {
  runId: string;
  filePath: string;
  directory: string;
  log(event: string, data?: LogData): void;
  writeTextFile(name: string, content: unknown, extension?: string): string;
  close(status: WorkflowRunStatus, extra?: LogData): void;
}

export function ensureLogDirectories(): LogDirectories {
  const startupDir = path.join(STORAGE_PATHS.appLogsDir, 'startup');
  [STORAGE_PATHS.logsDir, STORAGE_PATHS.appLogsDir, STORAGE_PATHS.workflowRunsDir, startupDir].forEach(ensureDir);

  return {
    root: STORAGE_PATHS.logsDir,
    runtime: STORAGE_PATHS.appLogsDir,
    workflows: STORAGE_PATHS.workflowRunsDir,
    startup: startupDir,
  };
}

export function createWorkflowRunLogger(
  workflow: WorkflowLogInput,
  context: WorkflowRunContext = {},
): WorkflowRunLogger {
  const now = new Date();
  const dirs = ensureLogDirectories();
  const dayDir = path.join(dirs.workflows, logDatePart(now));
  ensureDir(dayDir);

  const workflowId = sanitizeLogFilePart(workflow?.id || workflow?.workflowId, 'unsaved');
  const workflowName = sanitizeLogFilePart(workflow?.name || workflow?.workflowName, 'workflow');
  const runId = workflow.runId || `${logTimePart(now)}_${workflowId}`;
  const filePath = path.join(dayDir, `${runId}.jsonl`);

  const write = (event: string, data: LogData = {}) => {
    const entry = {
      timestamp: new Date().toISOString(),
      event,
      runId,
      workflowId,
      processInstanceId: getProcessInstanceId(),
      requestId: context.requestId,
      snapshotVersion: workflow?.snapshotVersion,
      source: workflow?.source,
      data,
    };
    fs.appendFileSync(filePath, `${JSON.stringify(entry)}\n`, 'utf8');
  };

  write('workflow_run_started', {
    runId,
    workflowId,
    workflowName,
    workflowVersion: workflow?.workflowVersion,
    snapshotVersion: workflow?.snapshotVersion,
    source: workflow?.source,
    nodeCount: Array.isArray(workflow?.nodes) ? workflow.nodes.length : 0,
    edgeCount: Array.isArray(workflow?.edges) ? workflow.edges.length : 0,
  });

  return {
    runId,
    filePath,
    directory: dayDir,
    log: write,
    writeTextFile(name: string, content: unknown, extension = 'txt') {
      const artifactName = sanitizeLogFilePart(name, 'artifact').replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 16);
      const filename = `${runId}_${artifactName}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${extension}`;
      const targetPath = path.join(dayDir, filename);
      fs.writeFileSync(targetPath, String(content || ''), 'utf8');
      return targetPath;
    },
    close(status: WorkflowRunStatus, extra: LogData = {}) {
      write(
        status === 'completed'
          ? 'workflow_run_completed'
          : status === 'cancelled'
            ? 'workflow_run_cancelled'
            : 'workflow_run_failed',
        { status, ...extra },
      );
    },
  };
}
