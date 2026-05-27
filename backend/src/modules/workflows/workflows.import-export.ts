import { ConflictError, ValidationError } from '../../app/errors/index.ts';
import type { DynamicValue, PlainObject } from '../types.ts';
import { migrateWorkflowDocument } from './workflow-migrations.ts';
import { normalizePersistedWorkflow, validateWorkflowId } from './workflows.schema.ts';

type WorkflowImportMode = 'generate_new_id' | 'preserve_id' | 'overwrite';
type WorkflowImportOptions = {
  id?: string;
  generateNewId?: boolean;
  hasExistingId?: boolean;
  mode?: WorkflowImportMode | string;
};

function isPlainObject(value: DynamicValue): value is PlainObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function exportWorkflowDocument(workflow: DynamicValue) {
  return normalizePersistedWorkflow(workflow, {
    preserveCreatedAt: true,
    updatedAt: workflow?.updatedAt,
  });
}

export function importWorkflowDocument(payload: DynamicValue, options: WorkflowImportOptions = {}) {
  if (!isPlainObject(payload)) {
    throw new ValidationError('WORKFLOW_IMPORT_INVALID', '导入工作流必须为对象');
  }

  const { workflow: migrated, report } = migrateWorkflowDocument(payload);
  const normalized = normalizePersistedWorkflow(migrated, {
    preserveCreatedAt: true,
    updatedAt: Date.now(),
  });

  const importMode = options.mode || (options.generateNewId ? 'generate_new_id' : 'preserve_id');
  const targetId =
    importMode === 'generate_new_id'
      ? `wf_${Date.now()}`
      : validateWorkflowId(options.id || normalized.id, 'workflow.id');

  if (!['generate_new_id', 'preserve_id', 'overwrite'].includes(importMode)) {
    throw new ValidationError('WORKFLOW_IMPORT_MODE_INVALID', '不支持的导入模式');
  }

  if (options.hasExistingId && importMode === 'preserve_id') {
    throw new ConflictError('WORKFLOW_IMPORT_CONFLICT', `工作流 ID ${targetId} 已存在`, {
      workflowId: targetId,
      suggestedModes: ['overwrite', 'generate_new_id'],
    });
  }

  const importedWorkflow = {
    ...normalized,
    id: targetId,
    updatedAt: Date.now(),
  };

  const warnings: string[] = [...report.warnings];
  if (targetId !== normalized.id) {
    warnings.push(`workflow.id 已重写为 ${targetId}`);
  }
  if (options.hasExistingId && importMode === 'overwrite') {
    warnings.push(`已覆盖现有工作流 ${targetId}`);
  }

  return {
    workflow: importedWorkflow,
    report: {
      ...report,
      warnings,
      result: warnings.length > 0 ? 'imported_with_warnings' : 'imported',
    },
  };
}
