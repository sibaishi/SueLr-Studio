import type {
  PersistedWorkflow,
  WorkflowImportConflictDetails,
  WorkflowImportError,
  WorkflowImportMode,
  WorkflowImportReport,
} from '@/domains/workflow/types';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function serializeWorkflowExport(workflow: PersistedWorkflow) {
  return JSON.stringify(workflow, null, 2);
}

export function parseWorkflowImport(content: string): Record<string, unknown> {
  const parsed = JSON.parse(content) as unknown;
  if (!isPlainObject(parsed)) {
    throw new Error('导入失败：文件内容必须为对象。');
  }
  return parsed;
}

export function buildImportMessage(report?: WorkflowImportReport | null) {
  if (!report) return '';
  if (!report.warnings.length) return '';
  return report.warnings.join('\n');
}

export function buildImportReportSections(report?: WorkflowImportReport | null) {
  if (!report) return [] as Array<{ title: string; lines: string[] }>;

  const sections = [
    {
      title: '版本',
      lines: [`源版本：v${report.sourceVersion}`, `目标版本：v${report.targetVersion}`, `结果：${report.result}`],
    },
  ];

  if (report.appliedMigrations.length > 0) {
    sections.push({ title: '迁移', lines: report.appliedMigrations });
  }
  if (report.warnings.length > 0) {
    sections.push({ title: '提示', lines: report.warnings });
  }
  if (report.rejectedFields.length > 0) {
    sections.push({ title: '忽略字段', lines: report.rejectedFields });
  }

  return sections;
}

export function getImportModeLabel(mode: WorkflowImportMode) {
  switch (mode) {
    case 'overwrite':
      return '覆盖现有工作流';
    case 'preserve_id':
      return '保留原 ID';
    default:
      return '生成新 ID';
  }
}

export function buildImportConflictMessage(error?: WorkflowImportError | null) {
  if (!error || error.code !== 'WORKFLOW_IMPORT_CONFLICT') return '';
  return error.message;
}

export function getSuggestedImportModes(details?: WorkflowImportConflictDetails) {
  return details?.suggestedModes || ['overwrite', 'generate_new_id'];
}
