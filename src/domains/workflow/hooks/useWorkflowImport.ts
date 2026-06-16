import { parseWorkflowImport } from '@/domains/workflow/lib/importExport';
import type { WorkflowImportError, WorkflowImportReport } from '@/domains/workflow/lib/persistenceTypes';
import { type ChangeEvent, useCallback, useRef, useState } from 'react';

type ImportStore = {
  importWorkflowData: (
    payload: unknown,
    fallbackName?: string,
  ) => Promise<{ success: boolean; report: WorkflowImportReport | null; error?: WorkflowImportError | null }>;
};

function formatWorkflowImportError(message?: string | null) {
  const detail = String(message || '').trim();
  return detail ? `导入工作流失败，请检查文件内容。${detail}` : '导入工作流失败，请检查文件内容。';
}

export function useWorkflowImport({
  store,
  resetHistory,
  clearWorkflowError,
}: {
  store: ImportStore;
  resetHistory: () => void;
  clearWorkflowError: () => void;
}) {
  const [importReport, setImportReport] = useState<WorkflowImportReport | null>(null);
  const [importReportFileName, setImportReportFileName] = useState<string>('');
  const [importErrorMessage, setImportErrorMessage] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const handleImportClick = useCallback(() => {
    importInputRef.current?.click();
  }, []);

  const applySuccessfulImport = useCallback(
    (report: WorkflowImportReport | null | undefined, fileName: string) => {
      setImportErrorMessage(null);
      clearWorkflowError();
      setImportReport(report || null);
      setImportReportFileName(fileName);
      resetHistory();
    },
    [clearWorkflowError, resetHistory],
  );

  const handleImportWorkflow = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;

      try {
        const content = await file.text();
        const parsed = parseWorkflowImport(content);
        const fallbackName = file.name.replace(/\.json$/i, '');
        setImportErrorMessage(null);
        const result = await store.importWorkflowData(parsed, fallbackName);
        if (!result.success) {
          setImportErrorMessage(formatWorkflowImportError(result.error?.message || '文件格式不正确。'));
          return;
        }
        applySuccessfulImport(result.report, file.name);
      } catch (error) {
        setImportErrorMessage(
          formatWorkflowImportError(error instanceof Error ? error.message : '无法读取或解析 JSON 文件。'),
        );
      }
    },
    [applySuccessfulImport, store],
  );

  return {
    importInputRef,
    importReport,
    importReportFileName,
    importErrorMessage,
    handleImportClick,
    handleImportWorkflow,
    setImportReport,
    setImportErrorMessage,
  };
}
