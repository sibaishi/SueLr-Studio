import { createIntelligenceRun } from '@/domains/workflow/lib/api';
import { ImagePreviewModal } from '@/domains/workflow/components/ImagePreviewModal';
import { FullscreenViewer } from '@/shared/ui/ios';
import { AlertTriangle, CheckCircle2, Clipboard, Loader2, Play, Save, SearchCheck, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export type WorkflowAIFailedNode = {
  id: string;
  label: string;
  type: string;
  error: string;
};

type RunSummary = {
  status?: Record<string, unknown>;
  summary?: string;
  report?: {
    totalDuration?: number;
    successCount?: number;
    failCount?: number;
    keyOutputs?: Array<{
      nodeId?: string;
      nodeType?: string;
      summary?: string;
    }>;
    artifacts?: Array<{
      type?: string;
      url?: string;
      name?: string;
      mimeType?: string;
    }>;
  };
  diagnosis?: {
    severity?: string;
    summary?: string;
    suggestions?: string[];
  };
};

type ResultArtifact = NonNullable<NonNullable<RunSummary['report']>['artifacts']>[number];

interface WorkflowAIDraftRunPanelProps {
  hasUnsavedChanges: boolean;
  isExecuting: boolean;
  failedNodes: WorkflowAIFailedNode[];
  lastExecutionRunId: string | null;
  lastExecutionStatus: 'success' | 'error' | null;
  onSave: () => Promise<void>;
  onExecute: () => Promise<void>;
  onSelectFailedNode: (nodeId: string) => void;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function parseRunSummary(skillResults: Array<{ skillId: string; output: unknown }>): RunSummary {
  const diagnosisOutput = asRecord(skillResults.find((item) => item.skillId === 'workflow.diagnose')?.output);
  const summaryOutput = asRecord(skillResults.find((item) => item.skillId === 'workflow.summarizeRun')?.output);
  return {
    status: asRecord(summaryOutput.status || diagnosisOutput.status),
    summary: typeof summaryOutput.summary === 'string' ? summaryOutput.summary : undefined,
    report: asRecord(summaryOutput.report) as RunSummary['report'],
    diagnosis: asRecord(diagnosisOutput.diagnosis) as RunSummary['diagnosis'],
  };
}

function getArtifactLabel(artifact: { type?: string; url?: string; name?: string; mimeType?: string }, index: number) {
  const name = typeof artifact.name === 'string' && artifact.name.trim() ? artifact.name.trim() : '';
  if (name) return name;
  const url = typeof artifact.url === 'string' ? artifact.url : '';
  const fileName = url.split('/').pop()?.split('?')[0] || '';
  return fileName || `结果文件 ${index + 1}`;
}

function getNumber(...values: unknown[]) {
  const value = values.find((item) => typeof item === 'number' && Number.isFinite(item));
  return typeof value === 'number' ? value : null;
}

function formatDuration(value: number | null) {
  if (value === null) return '未记录';
  if (value < 1000) return `${Math.round(value)} ms`;
  return `${(value / 1000).toFixed(value < 10000 ? 1 : 0)} s`;
}

function getStatusLabel(status?: Record<string, unknown>) {
  const value = String(status?.status || 'unknown');
  if (value === 'completed') return '已完成';
  if (value === 'failed') return '失败';
  if (value === 'cancelled') return '已取消';
  if (value === 'running') return '运行中';
  return '未找到运行';
}

function getStatusTone(status?: Record<string, unknown>) {
  const value = String(status?.status || 'unknown');
  if (value === 'completed') return 'success';
  if (value === 'failed') return 'danger';
  if (value === 'cancelled') return 'warning';
  return 'neutral';
}

const RESULT_PREVIEW_LIMIT = 5;

function getArtifactUrl(artifact: ResultArtifact) {
  return typeof artifact.url === 'string' ? artifact.url.trim() : '';
}

function isImageArtifact(artifact: ResultArtifact) {
  const source = `${artifact.type || ''} ${artifact.mimeType || ''} ${artifact.url || ''}`.toLowerCase();
  return source.includes('image') || /\.(png|jpe?g|gif|webp|bmp|svg)(\?.*)?$/.test(source);
}

function isVideoArtifact(artifact: ResultArtifact) {
  const source = `${artifact.type || ''} ${artifact.mimeType || ''} ${artifact.url || ''}`.toLowerCase();
  return source.includes('video') || /\.(mp4|mov|webm|m4v)(\?.*)?$/.test(source);
}

function isTextArtifact(artifact: ResultArtifact) {
  const source = `${artifact.type || ''} ${artifact.mimeType || ''} ${artifact.name || ''} ${artifact.url || ''}`.toLowerCase();
  return (
    source.includes('text') ||
    source.includes('json') ||
    /\.(txt|md|markdown|json|jsonl|csv|log|xml|yaml|yml)(\?.*)?$/.test(source)
  );
}

export default function WorkflowAIDraftRunPanel({
  hasUnsavedChanges,
  isExecuting,
  failedNodes,
  lastExecutionRunId,
  lastExecutionStatus,
  onSave,
  onExecute,
  onSelectFailedNode,
}: WorkflowAIDraftRunPanelProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDiagnosing, setIsDiagnosing] = useState(false);
  const [diagnosis, setDiagnosis] = useState<RunSummary | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [previewVideoUrl, setPreviewVideoUrl] = useState<string | null>(null);
  const [textPreview, setTextPreview] = useState<{
    title: string;
    url: string;
    text: string;
    isLoading: boolean;
    error: string;
  } | null>(null);

  const stepLabel = useMemo(() => {
    if (hasUnsavedChanges) return '草案已在新画布中打开，保存后可执行。';
    if (isExecuting) return '工作流正在执行，完成后可以查看诊断和总结。';
    if (lastExecutionStatus) return '运行已结束，可以查看诊断和总结。';
    return '已保存，可以用现有执行链路运行。';
  }, [hasUnsavedChanges, isExecuting, lastExecutionStatus]);

  const keyOutputs = Array.isArray(diagnosis?.report?.keyOutputs) ? diagnosis.report.keyOutputs : [];
  const visibleKeyOutputs = keyOutputs.slice(0, RESULT_PREVIEW_LIMIT);
  const remainingKeyOutputCount = Math.max(0, keyOutputs.length - visibleKeyOutputs.length);
  const resultFiles = Array.isArray(diagnosis?.report?.artifacts)
    ? diagnosis.report.artifacts.filter((artifact) => getArtifactUrl(artifact))
    : [];
  const visibleResultFiles = resultFiles.slice(0, RESULT_PREVIEW_LIMIT);
  const remainingResultFileCount = Math.max(0, resultFiles.length - visibleResultFiles.length);
  const imagePreviewItems = useMemo(
    () =>
      resultFiles
        .filter(isImageArtifact)
        .map((artifact) => ({
          src: getArtifactUrl(artifact),
          name: getArtifactLabel(artifact, 0),
        })),
    [resultFiles],
  );
  const previewImageIndex = previewImageUrl
    ? imagePreviewItems.findIndex((item) => item.src === previewImageUrl)
    : -1;

  useEffect(() => {
    if (!diagnosis && !errorMessage) return;

    const handlePointerDown = (event: PointerEvent) => {
      const panel = panelRef.current;
      if (panel && event.target instanceof Node && panel.contains(event.target)) return;
      setDiagnosis(null);
      setErrorMessage(null);
    };

    window.addEventListener('pointerdown', handlePointerDown, { capture: true });
    return () => window.removeEventListener('pointerdown', handlePointerDown, { capture: true });
  }, [diagnosis, errorMessage]);

  const handleSave = () => {
    if (isSaving) return;
    void (async () => {
      setIsSaving(true);
      setErrorMessage(null);
      try {
        await onSave();
      } finally {
        setIsSaving(false);
      }
    })();
  };

  const handleExecute = () => {
    if (hasUnsavedChanges || isExecuting) return;
    setErrorMessage(null);
    setDiagnosis(null);
    void onExecute();
  };

  const handleDiagnose = () => {
    if (!lastExecutionRunId || isDiagnosing) return;
    void (async () => {
      setIsDiagnosing(true);
      setErrorMessage(null);
      try {
        const result = await createIntelligenceRun({
          input: '诊断并总结当前 AI 草案工作流运行。',
          skills: ['workflow.diagnose', 'workflow.summarizeRun'],
          context: { runId: lastExecutionRunId },
        });
        if (!result.success || !result.data) {
          setErrorMessage(result.error || '诊断没有完成');
          return;
        }
        setDiagnosis(parseRunSummary(result.data.skillResults));
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : '诊断没有完成');
      } finally {
        setIsDiagnosing(false);
      }
    })();
  };

  const handleOpenArtifact = (artifact: ResultArtifact, index: number) => {
    const url = getArtifactUrl(artifact);
    if (!url) return;
    if (isImageArtifact(artifact)) {
      setPreviewImageUrl(url);
      return;
    }
    if (isVideoArtifact(artifact)) {
      setPreviewVideoUrl(url);
      return;
    }
    if (isTextArtifact(artifact)) {
      const title = getArtifactLabel(artifact, index);
      setTextPreview({ title, url, text: '', isLoading: true, error: '' });
      void (async () => {
        try {
          const response = await fetch(url);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const text = await response.text();
          setTextPreview({ title, url, text, isLoading: false, error: '' });
        } catch (error) {
          setTextPreview({
            title,
            url,
            text: '',
            isLoading: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      })();
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div ref={panelRef} className="workflow-ai-run-panel" data-testid="workflow-ai-run-panel">
      <div className="workflow-ai-run-panel__main">
        <div className="workflow-ai-run-panel__icon">
          {lastExecutionStatus === 'error' ? <AlertTriangle size={16} /> : <SearchCheck size={16} />}
        </div>
        <div className="workflow-ai-run-panel__copy">
          <strong>AI 草案执行闭环</strong>
          <span>{stepLabel}</span>
        </div>
      </div>

      <div className="workflow-ai-run-panel__actions">
        <button type="button" onClick={handleSave} disabled={!hasUnsavedChanges || isSaving || isExecuting}>
          {isSaving ? <Loader2 size={14} className="workflow-ai-assistant__spin" /> : <Save size={14} />}
          保存
        </button>
        <button type="button" onClick={handleExecute} disabled={hasUnsavedChanges || isExecuting}>
          <Play size={14} fill="currentColor" />
          执行
        </button>
        <button type="button" onClick={handleDiagnose} disabled={!lastExecutionRunId || isExecuting || isDiagnosing}>
          {isDiagnosing ? <Loader2 size={14} className="workflow-ai-assistant__spin" /> : <CheckCircle2 size={14} />}
          诊断
        </button>
      </div>

      {errorMessage && <div className="workflow-ai-run-panel__error">{errorMessage}</div>}

      {diagnosis && (
        <div className="workflow-ai-run-panel__result">
          <div
            className={`workflow-ai-run-panel__summary-card workflow-ai-run-panel__summary-card--${getStatusTone(
              diagnosis.status,
            )}`}
          >
            <div className="workflow-ai-run-panel__summary-head">
              <span>{getStatusLabel(diagnosis.status)}</span>
              <strong>{String(diagnosis.status?.status || '') === 'completed' ? '工作流已完成' : '运行诊断'}</strong>
            </div>
            <div className="workflow-ai-run-panel__metrics">
              <div>
                <span>成功节点</span>
                <strong>{getNumber(diagnosis.report?.successCount, diagnosis.status?.successCount) ?? 0}</strong>
              </div>
              <div>
                <span>失败节点</span>
                <strong>{getNumber(diagnosis.report?.failCount, diagnosis.status?.failCount) ?? 0}</strong>
              </div>
              <div>
                <span>耗时</span>
                <strong>{formatDuration(getNumber(diagnosis.report?.totalDuration, diagnosis.status?.totalDuration))}</strong>
              </div>
              <div>
                <span>结果文件</span>
                <strong>{resultFiles.length}</strong>
              </div>
            </div>
          </div>
          {diagnosis.diagnosis?.summary && String(diagnosis.status?.status || '') !== 'completed' && (
            <strong>{diagnosis.diagnosis.summary}</strong>
          )}
          {visibleKeyOutputs.length > 0 && (
            <div className="workflow-ai-run-panel__report">
              <div className="workflow-ai-run-panel__failed-title">结果报告</div>
              {visibleKeyOutputs.map((item, index) => (
                <div key={`${item.nodeId || 'output'}-${index}`} className="workflow-ai-run-panel__report-row">
                  <strong>{item.nodeId || item.nodeType || `输出 ${index + 1}`}</strong>
                  <span>{item.summary || '已有输出。'}</span>
                </div>
              ))}
              {remainingKeyOutputCount > 0 && (
                <div className="workflow-ai-run-panel__more">
                  还有 {remainingKeyOutputCount} 条输出摘要，请在右侧结果面板查看完整内容。
                </div>
              )}
            </div>
          )}
          {visibleResultFiles.length > 0 && (
            <div className="workflow-ai-run-panel__artifacts">
              <div className="workflow-ai-run-panel__failed-title">结果文件</div>
              {visibleResultFiles.map((artifact, index) => (
                <button
                  type="button"
                  key={`${artifact.url || artifact.name || 'artifact'}-${index}`}
                  onClick={() => handleOpenArtifact(artifact, index)}
                >
                  <span>{getArtifactLabel(artifact, index)}</span>
                  <small>{artifact.type || artifact.mimeType || '文件'}</small>
                </button>
              ))}
              {remainingResultFileCount > 0 && (
                <div className="workflow-ai-run-panel__more">
                  还有 {remainingResultFileCount} 个结果文件，请在右侧结果面板查看完整列表。
                </div>
              )}
            </div>
          )}
          {String(diagnosis.status?.status || '') === 'completed' &&
            resultFiles.length === 0 && (
              <div className="workflow-ai-run-panel__empty-report">
                <strong>本次运行没有生成可打开的结果文件</strong>
                <span>如果节点已经生成内容，请在右侧结果面板查看完整输出和节点日志。</span>
              </div>
            )}
          {failedNodes.length > 0 && (
            <div className="workflow-ai-run-panel__failed-nodes">
              <div className="workflow-ai-run-panel__failed-title">失败节点</div>
              {failedNodes.slice(0, 4).map((node) => (
                <div key={node.id} className="workflow-ai-run-panel__failed-node">
                  <div className="workflow-ai-run-panel__failed-copy">
                    <strong>{node.label}</strong>
                    <span>{node.error}</span>
                  </div>
                  <button type="button" onClick={() => onSelectFailedNode(node.id)}>
                    定位
                  </button>
                </div>
              ))}
            </div>
          )}
          {Array.isArray(diagnosis.diagnosis?.suggestions) && diagnosis.diagnosis.suggestions.length > 0 && (
            <ul>
              {diagnosis.diagnosis.suggestions.slice(0, 3).map((suggestion) => (
                <li key={suggestion}>{suggestion}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {previewImageUrl && (
        <ImagePreviewModal
          src={previewImageUrl}
          images={imagePreviewItems.length > 0 ? imagePreviewItems : [{ src: previewImageUrl }]}
          initialIndex={previewImageIndex >= 0 ? previewImageIndex : 0}
          onClose={() => setPreviewImageUrl(null)}
        />
      )}
      <FullscreenViewer url={previewVideoUrl} mediaType="video" onClose={() => setPreviewVideoUrl(null)} />
      {textPreview && <AITextPreviewModal preview={textPreview} onClose={() => setTextPreview(null)} />}
    </div>
  );
}

function AITextPreviewModal({
  preview,
  onClose,
}: {
  preview: { title: string; text: string; isLoading: boolean; error: string };
  onClose: () => void;
}) {
  return createPortal(
    <div
      className="workflow-text-preview-modal"
      role="dialog"
      aria-modal="true"
      aria-label={preview.title}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="workflow-text-preview-modal__dialog" onMouseDown={(event) => event.stopPropagation()}>
        <div className="workflow-text-preview-modal__header">
          <div className="min-w-0">
            <div className="workflow-text-preview-modal__title">{preview.title}</div>
            <div className="workflow-text-preview-modal__meta">
              {preview.isLoading
                ? '读取中...'
                : preview.error
                  ? '读取失败'
                  : `${preview.text ? preview.text.split(/\r\n|\r|\n/).length : 0} 行 · ${preview.text.length} 字符`}
            </div>
          </div>
          <div className="workflow-text-preview-modal__actions">
            <button
              type="button"
              onClick={() => void navigator.clipboard?.writeText(preview.text)}
              disabled={!preview.text || preview.isLoading}
              className="workflow-results__mini-action"
            >
              <Clipboard size={11} />
              复制
            </button>
            <button
              type="button"
              onClick={onClose}
              className="workflow-text-preview-modal__close"
              aria-label="关闭文本预览"
            >
              <X size={16} />
            </button>
          </div>
        </div>
        <div className="workflow-text-preview-modal__body">
          {preview.isLoading && (
            <div className="workflow-text-preview-modal__state">
              <Loader2 size={18} className="workflow-text-preview-modal__spinner" />
              正在读取文本内容...
            </div>
          )}
          {!preview.isLoading && preview.error && (
            <div className="workflow-text-preview-modal__state workflow-text-preview-modal__state--error">
              {preview.error}
            </div>
          )}
          {!preview.isLoading && !preview.error && (
            <pre className="workflow-text-preview-modal__text">{preview.text || '(空内容)'}</pre>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
