import type {
  PersistedWorkflow,
  WorkflowImportConflictDetails,
  WorkflowImportError,
  WorkflowImportMode,
  WorkflowImportReport,
} from './persistenceTypes';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function serializeWorkflowExport(workflow: PersistedWorkflow) {
  return JSON.stringify(workflow, null, 2);
}

export function parseWorkflowImport(content: string): Record<string, unknown> {
  const parsed = JSON.parse(content) as unknown;
  if (!isPlainObject(parsed)) {
    throw new Error('瀵煎叆澶辫触锛氭枃浠跺唴瀹瑰繀椤讳负瀵硅薄銆?');
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
      title: '鐗堟湰',
      lines: [`婧愮増鏈細v${report.sourceVersion}`, `鐩爣鐗堟湰锛歷${report.targetVersion}`, `缁撴灉锛?{report.result}`],
    },
  ];

  if (report.appliedMigrations.length > 0) {
    sections.push({ title: '杩佺Щ', lines: report.appliedMigrations });
  }
  if (report.warnings.length > 0) {
    sections.push({ title: '鎻愮ず', lines: report.warnings });
  }
  if (report.rejectedFields.length > 0) {
    sections.push({ title: '蹇界暐瀛楁', lines: report.rejectedFields });
  }

  return sections;
}

export function getImportModeLabel(mode: WorkflowImportMode) {
  switch (mode) {
    case 'overwrite':
      return '瑕嗙洊鐜版湁宸ヤ綔娴?';
    case 'preserve_id':
      return '淇濈暀鍘?ID';
    default:
      return '鐢熸垚鏂?ID';
  }
}

export function buildImportConflictMessage(error?: WorkflowImportError | null) {
  if (!error || error.code !== 'WORKFLOW_IMPORT_CONFLICT') return '';
  return error.message;
}

export function getSuggestedImportModes(details?: WorkflowImportConflictDetails) {
  return details?.suggestedModes || ['overwrite', 'generate_new_id'];
}
