import fs from 'fs';
import path from 'path';
import { STORAGE_PATHS } from '../storage/index.js';
import { ensureDir } from '../storage/ensure-dir.js';

function safeName(value) {
  return String(value || 'workflow')
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

export function ensureLogDirectories() {
  const startupDir = path.join(STORAGE_PATHS.appLogsDir, 'startup');
  [
    STORAGE_PATHS.logsDir,
    STORAGE_PATHS.appLogsDir,
    STORAGE_PATHS.workflowRunsDir,
    startupDir,
  ].forEach(ensureDir);

  return {
    root: STORAGE_PATHS.logsDir,
    runtime: STORAGE_PATHS.appLogsDir,
    workflows: STORAGE_PATHS.workflowRunsDir,
    startup: startupDir,
  };
}

export function createWorkflowRunLogger(workflow, context = {}) {
  const now = new Date();
  const dirs = ensureLogDirectories();
  const dayDir = path.join(dirs.workflows, datePart(now));
  ensureDir(dayDir);

  const workflowId = safeName(workflow?.id || workflow?.workflowId || 'unsaved');
  const workflowName = safeName(workflow?.name || workflow?.workflowName || 'workflow');
  const runId = `${timePart(now)}_${workflowId}`;
  const filePath = path.join(dayDir, `${workflowName}_${runId}.jsonl`);

  const write = (event, data = {}) => {
    const entry = {
      timestamp: new Date().toISOString(),
      event,
      runId,
      workflowId,
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
    writeTextFile(name, content, extension = 'txt') {
      const filename = `${workflowName}_${runId}_${safeName(name)}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${extension}`;
      const targetPath = path.join(dayDir, filename);
      fs.writeFileSync(targetPath, String(content || ''), 'utf8');
      return targetPath;
    },
    close(status, extra = {}) {
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
