import { ValidationError } from '../../app/errors/index.js';

export const CURRENT_WORKFLOW_SCHEMA_VERSION = 1;

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function migrateWorkflowDocument(input) {
  if (!isPlainObject(input)) {
    throw new ValidationError('WORKFLOW_IMPORT_INVALID', '工作流数据必须为对象');
  }

  const sourceVersion = Number(input.version) || 1;
  if (sourceVersion > CURRENT_WORKFLOW_SCHEMA_VERSION) {
    throw new ValidationError('WORKFLOW_VERSION_UNSUPPORTED', `暂不支持导入版本 ${sourceVersion} 的工作流`, {
      sourceVersion,
      targetVersion: CURRENT_WORKFLOW_SCHEMA_VERSION,
    });
  }

  return {
    workflow: { ...input, version: CURRENT_WORKFLOW_SCHEMA_VERSION },
    report: {
      sourceVersion,
      targetVersion: CURRENT_WORKFLOW_SCHEMA_VERSION,
      appliedMigrations:
        sourceVersion === CURRENT_WORKFLOW_SCHEMA_VERSION
          ? []
          : [`v${sourceVersion}->v${CURRENT_WORKFLOW_SCHEMA_VERSION}`],
      warnings: [],
      rejectedFields: [],
    },
  };
}
