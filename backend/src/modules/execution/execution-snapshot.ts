import { ValidationError } from '../../app/errors/index.js';
import type { DynamicValue, PlainObject } from '../types.js';
import { CURRENT_WORKFLOW_SCHEMA_VERSION } from '../workflows/workflow-migrations.js';
import { normalizePersistedWorkflow } from '../workflows/workflows.schema.js';

export const CURRENT_SNAPSHOT_VERSION = 1;

type ExecutionSnapshotInput = {
  persistedWorkflow?: DynamicValue;
  draftWorkflow?: DynamicValue;
  runId?: string;
};

function buildRunId(workflowId: string): string {
  const now = new Date().toISOString().replace(/[:.]/g, '-');
  return `${now}_${workflowId}`;
}

export function createExecutionSnapshot({
  persistedWorkflow,
  draftWorkflow,
  runId = undefined,
}: ExecutionSnapshotInput): PlainObject {
  const source = draftWorkflow ? 'draft' : 'persisted';
  const baseWorkflow = draftWorkflow || persistedWorkflow;
  if (!baseWorkflow) {
    throw new ValidationError('EXECUTION_WORKFLOW_REQUIRED', '执行时缺少工作流数据');
  }

  const normalizedWorkflow = normalizePersistedWorkflow(baseWorkflow, {
    preserveCreatedAt: true,
    updatedAt: persistedWorkflow?.updatedAt,
  });
  const resolvedRunId = runId || buildRunId(normalizedWorkflow.id);

  return {
    runId: resolvedRunId,
    workflowId: persistedWorkflow?.id || normalizedWorkflow.id,
    workflowVersion: Number(normalizedWorkflow.version) || CURRENT_WORKFLOW_SCHEMA_VERSION,
    snapshotVersion: CURRENT_SNAPSHOT_VERSION,
    source,
    nodeContractVersion: 1,
    name: normalizedWorkflow.name,
    nodes: normalizedWorkflow.nodes,
    edges: normalizedWorkflow.edges,
    settings: normalizedWorkflow.settings,
    createdAt: Date.now(),
  };
}
