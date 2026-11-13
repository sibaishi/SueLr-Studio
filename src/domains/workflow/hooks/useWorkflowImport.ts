import { getWorkflowAssetReferences, readWorkflowArchive } from '@/domains/workflow/lib/workflowArchive';
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
  const importing = useRef(false);

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
      if (!file || importing.current) return;
      importing.current = true;

      let archive: Awaited<ReturnType<typeof readWorkflowArchive>> | undefined;
      let imported = false;
      try {
        if (/\.zip$/i.test(file.name)) archive = await readWorkflowArchive(file);
        const parsed = archive?.workflow ?? parseWorkflowImport(await file.text());
        const missing: string[] = [];
        if (!archive) {
          for (const url of getWorkflowAssetReferences(parsed)) {
            const response = await fetch(url, { method: 'HEAD', redirect: 'error' }).catch(() => null);
            if (!response?.ok || response.headers.get('content-type')?.startsWith('text/html')) missing.push(url);
          }
        }
        const fallbackName = file.name.replace(/\.(json|zip)$/i, '');
        setImportErrorMessage(null);
        const result = await store.importWorkflowData(parsed, fallbackName);
        if (!result.success) {
          setImportErrorMessage(formatWorkflowImportError(result.error?.message || '文件格式不正确。'));
          return;
        }
        imported = true;
        const report = result.report;
        if (report && missing.length) {
          report.warnings.push(...missing.map((url) => `本地素材不可用，请在画布重新选择：${url}`));
        }
        applySuccessfulImport(report, file.name);
      } catch (error) {
        setImportErrorMessage(
          formatWorkflowImportError(error instanceof Error ? error.message : '无法读取工作流文件。'),
        );
      } finally {
        if (!imported) await archive?.rollback();
        importing.current = false;
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
