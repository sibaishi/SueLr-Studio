import {
  buildImportConflictMessage,
  getSuggestedImportModes,
  parseWorkflowImport,
} from '@/domains/workflow/lib/importExport';
import type {
  WorkflowImportError,
  WorkflowImportMode,
  WorkflowImportReport,
} from '@/domains/workflow/lib/persistenceTypes';
import { type ChangeEvent, useCallback, useRef, useState } from 'react';

type ImportStore = {
  importWorkflowData: (
    payload: unknown,
    fallbackName?: string,
  ) => Promise<{ success: boolean; report: WorkflowImportReport | null; error?: WorkflowImportError | null }>;
  importWorkflowDataWithMode: (
    payload: unknown,
    mode: WorkflowImportMode,
    fallbackName?: string,
  ) => Promise<{ success: boolean; report: WorkflowImportReport | null; error?: WorkflowImportError | null }>;
};

type PendingImport = {
  payload: Record<string, unknown>;
  fallbackName: string;
  fileName: string;
};

function formatWorkflowImportError(message?: string | null) {
  const detail = String(message || '').trim();
  return detail
    ? `导入工作流失败，请检查文件内容或更换导入模式。${detail}`
    : '导入工作流失败，请检查文件内容或更换导入模式。';
}

export function useWorkflowImport({
  store,
  confirmDiscardChanges,
  resetHistory,
  clearWorkflowError,
}: {
  store: ImportStore;
  confirmDiscardChanges: (actionLabel: string) => boolean;
  resetHistory: () => void;
  clearWorkflowError: () => void;
}) {
  const [importReport, setImportReport] = useState<WorkflowImportReport | null>(null);
  const [importReportFileName, setImportReportFileName] = useState<string>('');
  const [importConflict, setImportConflict] = useState<WorkflowImportError | null>(null);
  const [importErrorMessage, setImportErrorMessage] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const pendingImportRef = useRef<PendingImport | null>(null);

  const handleImportClick = useCallback(() => {
    if (!confirmDiscardChanges('导入工作流')) return;
    importInputRef.current?.click();
  }, [confirmDiscardChanges]);

  const applySuccessfulImport = useCallback(
    (report: WorkflowImportReport | null | undefined, fileName: string) => {
      setImportConflict(null);
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
        pendingImportRef.current = { payload: parsed, fallbackName, fileName: file.name };
        setImportErrorMessage(null);
        const result = await store.importWorkflowData(parsed, fallbackName);
        if (!result.success) {
          const conflictMessage = buildImportConflictMessage(result.error);
          if (conflictMessage) {
            setImportConflict(result.error || null);
            setImportReport(null);
            setImportReportFileName(file.name);
            return;
          }
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

  const retryImport = useCallback(
    async (mode: WorkflowImportMode) => {
      const pending = pendingImportRef.current;
      if (!pending) return;
      const result = await store.importWorkflowDataWithMode(pending.payload, mode, pending.fallbackName);
      if (!result.success) {
        const nextConflictMessage = buildImportConflictMessage(result.error);
        if (nextConflictMessage) {
          setImportReport(null);
          setImportConflict(result.error || null);
          return;
        }
        setImportErrorMessage(formatWorkflowImportError(result.error?.message));
        return;
      }
      applySuccessfulImport(result.report, pending.fileName);
    },
    [applySuccessfulImport, store],
  );

  return {
    importInputRef,
    importReport,
    importReportFileName,
    importConflict,
    importErrorMessage,
    retryModes: importConflict ? getSuggestedImportModes(importConflict.details) : [],
    reportRetryModes: pendingImportRef.current ? getSuggestedImportModes() : [],
    handleImportClick,
    handleImportWorkflow,
    retryImport,
    setImportReport,
    setImportConflict,
    setImportErrorMessage,
  };
}
