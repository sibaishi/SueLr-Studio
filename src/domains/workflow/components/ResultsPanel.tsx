import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  CheckCircle2,
  Clipboard,
  Clock3,
  FileText,
  ImageIcon,
  Loader2,
  PlayCircle,
  TerminalSquare,
  Video,
  X,
} from 'lucide-react';
import { getNodeDef } from '@/domains/workflow/lib/constants';
import { NODE_ICONS } from '@/domains/workflow/components/nodes/nodeConstants';
import { useWorkflowStore } from '@/domains/workflow/lib/store';
import { ImagePreviewModal, type PreviewImageItem } from '@/domains/workflow/components/ImagePreviewModal';
import { ImageSizeLabel } from '@/domains/workflow/components/ImageSizeLabel';
import { formatDurationSeconds, getExecutionStatusLabel } from '@/domains/workflow/lib/executionFormat';
import { clearGeneratedOutputs, fetchGeneratedOutputs, type GeneratedOutputFile } from '@/domains/workflow/lib/api';
import { getCachedRuntimeCapabilities } from '@/shared/api/serverState';

type PanelTab = 'results' | 'logs';
const LOG_MESSAGE_PREVIEW_LIMIT = 600;
const LOG_DETAILS_PREVIEW_LIMIT = 4000;

export default function ResultsPanel({
  onBackfillImage,
  onBackfillText,
}: {
  onBackfillImage?: (image: PreviewImageItem) => void;
  onBackfillText?: (text: string) => void;
}) {
  const [tab, setTab] = useState<PanelTab>('results');
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [generatedOutputs, setGeneratedOutputs] = useState<GeneratedOutputFile[]>([]);
  const [isLoadingOutputs, setIsLoadingOutputs] = useState(false);
  const [isClearingOutputs, setIsClearingOutputs] = useState(false);
  const [outputsError, setOutputsError] = useState<string | null>(null);
  const nodes = useWorkflowStore((s) => s.nodes);
  const executionLogs = useWorkflowStore((s) => s.executionLogs);
  const lastExecutionStatus = useWorkflowStore((s) => s.lastExecutionStatus);
  const lastExecutionTime = useWorkflowStore((s) => s.lastExecutionTime);
  const isExecuting = useWorkflowStore((s) => s.isExecuting);
  const workflowWarningMessage = useWorkflowStore((s) => s.workflowWarningMessage);
  const nodeWarnings = useWorkflowStore((s) => s.nodeWarnings);
  const selectedNodeId = useWorkflowStore((s) => s.selectedNodeId);
  const clearExecutionLogs = useWorkflowStore((s) => s.clearExecutionLogs);
  const runtimeCapabilities = getCachedRuntimeCapabilities();
  const isServerRuntime = runtimeCapabilities?.mode?.startsWith('server') ?? false;

  const refreshGeneratedOutputs = useCallback(async () => {
    setIsLoadingOutputs(true);
    const result = await fetchGeneratedOutputs();
    setIsLoadingOutputs(false);
    if (result.success) {
      setGeneratedOutputs(result.data || []);
      setOutputsError(null);
      return;
    }
    setOutputsError(result.error || '读取生成文件失败');
  }, []);

  useEffect(() => {
    void refreshGeneratedOutputs();
  }, [refreshGeneratedOutputs, lastExecutionStatus]);

  useEffect(() => {
    if (!isExecuting) return;
    const timer = window.setInterval(() => {
      void refreshGeneratedOutputs();
    }, 2500);
    return () => window.clearInterval(timer);
  }, [isExecuting, refreshGeneratedOutputs]);

  const handleClearGeneratedOutputs = useCallback(async () => {
    const confirmed = window.confirm('确定要清除服务器后端当前保留的历史输出吗？此操作会直接删除服务器上的临时输出文件，且无法撤回。');
    if (!confirmed) return;

    setIsClearingOutputs(true);
    const result = await clearGeneratedOutputs();
    setIsClearingOutputs(false);

    if (!result.success) {
      setOutputsError(result.error || '清除服务器输出失败');
      return;
    }

    await refreshGeneratedOutputs();
  }, [refreshGeneratedOutputs]);

  const warningItems = useMemo(() => {
    return nodes
      .filter((node) => nodeWarnings[node.id])
      .map((node) => {
        const def = getNodeDef(node.type || '');
        return {
          id: node.id,
          label: def?.label || node.type || node.id,
          warning: nodeWarnings[node.id],
        };
      });
  }, [nodeWarnings, nodes]);

  const selectedMaskInfo = useMemo(() => {
    if (!selectedNodeId) return null;
    const node = nodes.find((item) => item.id === selectedNodeId);
    if (!node || node.type !== 'imageInput') return null;
    const maskFileUrl = typeof node.data.maskFileUrl === 'string' ? node.data.maskFileUrl : '';
    const maskPreviewUrl = typeof node.data.maskPreviewUrl === 'string' ? node.data.maskPreviewUrl : '';
    const maskSrc = maskPreviewUrl && !(maskPreviewUrl.startsWith('blob:') && maskFileUrl)
      ? maskPreviewUrl
      : maskFileUrl;
    return {
      label: getNodeDef(node.type || '')?.label || '图像输入',
      src: maskSrc,
      hasMask: Boolean(maskSrc),
    };
  }, [nodes, selectedNodeId]);

  const imageGallery = useMemo<PreviewImageItem[]>(() => {
    return generatedOutputs
      .filter((file) => file.type === 'image')
      .map((file) => ({
        src: file.url,
        thumbnailSrc: file.thumbnailUrl,
        name: file.name,
      }));
  }, [generatedOutputs]);
  const previewImageIndex = previewImage
    ? imageGallery.findIndex((item) => item.src === previewImage)
    : -1;

  return (
    <aside className="workflow-panel workflow-results glass">
      <div className="workflow-panel__header">
        <div>
          <div className="workflow-panel__eyebrow">执行观察</div>
          <div className="workflow-panel__title">结果面板</div>
          <div className="workflow-panel__desc">查看 AI 输出、运行日志和启动前校验信息。</div>
        </div>
      </div>

      <div className="workflow-results__summary">
        <SummaryCard
          icon={<PlayCircle size={15} />}
          label="运行状态"
          value={getExecutionStatusLabel(isExecuting, lastExecutionStatus)}
          tone={isExecuting ? 'accent' : lastExecutionStatus === 'error' ? 'danger' : 'neutral'}
        />
        <SummaryCard
          icon={<Clock3 size={15} />}
          label="最近耗时"
          value={formatDurationSeconds(lastExecutionTime) || '还没有运行记录'}
          tone="neutral"
        />
      </div>

      <div className="workflow-results__tabs">
        <TabButton active={tab === 'results'} onClick={() => setTab('results')} label="结果" />
        <TabButton active={tab === 'logs'} onClick={() => setTab('logs')} label={`日志 ${executionLogs.length ? executionLogs.length : ''}`} />
      </div>

      {isServerRuntime && tab === 'results' && generatedOutputs.length > 0 ? (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
          <button
            type="button"
            onClick={() => { void handleClearGeneratedOutputs(); }}
            className="workflow-results__mini-action"
            disabled={isClearingOutputs}
          >
            {isClearingOutputs ? '清除中...' : '清空服务器结果'}
          </button>
        </div>
      ) : null}

      <div className="workflow-panel__body workflow-results__body">
        {workflowWarningMessage && (
          <div className="workflow-results__banner workflow-results__banner--warning">
            <AlertTriangle size={14} />
            <span>{workflowWarningMessage}</span>
          </div>
        )}

        {selectedMaskInfo && (
          <div className="workflow-results__banner workflow-results__banner--mask">
            <CheckCircle2 size={14} />
            <span>{selectedMaskInfo.label}：{selectedMaskInfo.hasMask ? '当前节点已附带遮罩输出' : '当前节点还没有遮罩输出'}</span>
          </div>
        )}

        {warningItems.length > 0 && (
          <div className="workflow-results__warning-list">
            <div className="workflow-results__section-title">启动前校验</div>
            {warningItems.map((item) => (
              <div key={item.id} className="workflow-results__warning-item">
                <span>{item.label}</span>
                <span>{item.warning}</span>
              </div>
            ))}
          </div>
        )}

        {tab === 'results' ? (
          <ResultsList
            files={generatedOutputs}
            selectedMaskInfo={selectedMaskInfo}
            isLoading={isLoadingOutputs}
            error={outputsError}
            onPreviewImage={setPreviewImage}
            onBackfillText={onBackfillText}
          />
        ) : (
          <LogsList logs={executionLogs} onClear={clearExecutionLogs} />
        )}
      </div>

      {previewImage && (
        <ImagePreviewModal
          src={previewImage}
          images={previewImageIndex >= 0 ? imageGallery : [{ src: previewImage }]}
          initialIndex={previewImageIndex >= 0 ? previewImageIndex : 0}
          onClose={() => setPreviewImage(null)}
          onBackfillImage={(image) => {
            onBackfillImage?.(image);
            setPreviewImage(null);
          }}
        />
      )}
    </aside>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: 'neutral' | 'accent' | 'danger';
}) {
  return (
    <div className={`workflow-results__summary-card workflow-results__summary-card--${tone}`}>
      <div className="workflow-results__summary-icon">{icon}</div>
      <div className="min-w-0">
        <div className="workflow-results__summary-label">{label}</div>
        <div className="workflow-results__summary-value">{value}</div>
      </div>
    </div>
  );
}

function TabButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`workflow-results__tab ${active ? 'workflow-results__tab--active' : ''}`}
    >
      {label}
    </button>
  );
}

function ResultsList({
  files,
  selectedMaskInfo,
  isLoading,
  error,
  onPreviewImage,
  onBackfillText,
}: {
  files: GeneratedOutputFile[];
  selectedMaskInfo: { label: string; src: string; hasMask: boolean } | null;
  isLoading: boolean;
  error: string | null;
  onPreviewImage: (src: string) => void;
  onBackfillText?: (text: string) => void;
}) {
  const resultItems = files.map((file) => ({
    id: file.id,
    type: file.type === 'video' ? 'videoGen' : 'imageGen',
    label: file.name,
    color: file.type === 'video' ? '#AF52DE' : '#FF9500',
    outputLabels: { content: file.relativePath },
    outputs: { content: { url: file.url, thumbnailUrl: file.thumbnailUrl, type: file.type, name: file.name, mimeType: file.mimeType, width: file.width, height: file.height } },
  }));

  if (error) {
    return <EmptyState icon={<AlertTriangle size={20} />} title="结果读取失败" body={error} />;
  }

  if (files.length === 0 && !selectedMaskInfo?.hasMask && isLoading) {
    return <EmptyState icon={<ImageIcon size={20} />} title="正在读取生成文件" body="正在从外部文件存储生成目录同步结果。" />;
  }

  if (files.length === 0 && !selectedMaskInfo?.hasMask) {
    return <EmptyState icon={<ImageIcon size={20} />} title="还没有 AI 输出" body="执行后，这里会集中显示文本、图片和视频结果。" action="先运行一次工作流，或检查节点是否具备可输出内容。" />;
  }

  return (
    <div className="workflow-results__stack">
      {selectedMaskInfo?.hasMask && selectedMaskInfo.src && (
        <div className="workflow-results__card workflow-results__card--mask-preview">
          <div className="workflow-results__card-header">
            <span className="workflow-results__node-badge workflow-results__node-badge--mask">MASK</span>
            <span className="workflow-results__node-title" style={{ color: '#7C4DFF' }}>
              当前选中节点的遮罩预览
            </span>
          </div>
          <ImageResult src={selectedMaskInfo.src} onPreviewImage={onPreviewImage} />
        </div>
      )}
      {resultItems.map((item) => item && (
        <div key={item.id} className="workflow-results__card">
          <div className="workflow-results__card-header">
            <span className="workflow-results__node-badge" style={{ background: `${item.color}18`, color: item.color }}>
              <NodeBadgeIcon nodeType={item.type} />
            </span>
            <span className="workflow-results__node-title" style={{ color: item.color }}>
              {item.label}
            </span>
          </div>
          <AiOutputGroup
            outputs={item.outputs}
            outputLabels={item.outputLabels}
            onPreviewImage={onPreviewImage}
            onBackfillText={onBackfillText}
          />
        </div>
      ))}
    </div>
  );
}

function NodeBadgeIcon({ nodeType }: { nodeType: string }) {
  const def = getNodeDef(nodeType);
  const Icon = NODE_ICONS[def?.icon || 'eye'] || NODE_ICONS.eye;
  return <Icon size={14} strokeWidth={2.1} />;
}

function AiOutputGroup({
  outputs,
  outputLabels,
  onPreviewImage,
  onBackfillText,
}: {
  outputs: Record<string, unknown>;
  outputLabels: Record<string, string>;
  onPreviewImage: (src: string) => void;
  onBackfillText?: (text: string) => void;
}) {
  const entries = Object.entries(outputs)
    .filter(([key]) => key !== 'savedFiles' && key !== 'savedPaths')
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => [key, unwrapOutputValue(value)] as const);

  if (entries.length === 0) return <TextResult text="" />;

  if (entries.length === 1) {
    return <AiOutputValue value={entries[0][1]} onPreviewImage={onPreviewImage} onBackfillText={onBackfillText} />;
  }

  return (
    <div className="workflow-results__group">
      {entries.map(([key, value]) => (
        <div key={key}>
          <div className="workflow-results__group-label">{outputLabels[key] || key}</div>
          <AiOutputValue value={value} onPreviewImage={onPreviewImage} onBackfillText={onBackfillText} />
        </div>
      ))}
    </div>
  );
}

function AiOutputValue({
  value,
  onPreviewImage,
  onBackfillText,
}: {
  value: unknown;
  onPreviewImage: (src: string) => void;
  onBackfillText?: (text: string) => void;
}) {
  if (isGeneratedOutputValue(value)) {
    if (value.type === 'image') return <ImageResult src={value.url} thumbnailSrc={value.thumbnailUrl} width={value.width} height={value.height} onPreviewImage={onPreviewImage} />;
    if (value.type === 'video') return <VideoResult src={value.url} />;
    if (value.type === 'audio') return <audio src={value.url} controls className="w-full" />;
    if (isPreviewableTextOutput(value)) {
      return <TextFileResult url={value.url} name={value.name || value.url} onBackfillText={onBackfillText} />;
    }
    return (
      <a href={value.url} target="_blank" rel="noreferrer" className="workflow-results__text">
        {value.name || value.url}
      </a>
    );
  }

  if (typeof value === 'string') {
    if (isRenderableOutputImageUrl(value)) return <ImageResult src={value} onPreviewImage={onPreviewImage} />;
    if (isRenderableOutputVideoUrl(value)) return <VideoResult src={value} />;
    if (isRenderableOutputAudioUrl(value)) return <audio src={value} controls className="w-full" />;
    return <TextResult text={value} />;
  }

  if (Array.isArray(value)) {
    const normalized = value.map(unwrapOutputValue);
    const values = normalized.filter((item): item is string => typeof item === 'string');
    if (values.length === normalized.length && values.every(isRenderableOutputImageUrl)) {
      return (
        <div className="grid grid-cols-2 gap-2">
          {values.map((src, index) => (
            <ImageResult key={`${src}-${index}`} src={src} onPreviewImage={onPreviewImage} compact />
          ))}
        </div>
      );
    }
    if (values.length === normalized.length && values.every(isRenderableOutputVideoUrl)) {
      return <div className="space-y-2">{values.map((src) => <VideoResult key={src} src={src} compact />)}</div>;
    }
    if (values.length === normalized.length && values.every(isRenderableOutputAudioUrl)) {
      return <div className="space-y-2">{values.map((src) => <audio key={src} src={src} controls className="w-full" />)}</div>;
    }
    return <TextResult text={JSON.stringify(normalized, null, 2)} mono />;
  }

  return <TextResult text={JSON.stringify(value, null, 2)} mono />;
}

function TextResult({
  text,
  mono = false,
}: {
  text: string;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="mb-1 flex justify-end">
        <button
          type="button"
          onClick={() => void navigator.clipboard?.writeText(text)}
          className="workflow-results__mini-action"
        >
          <Clipboard size={10} />
          复制
        </button>
      </div>
      <div className={`workflow-results__text ${mono ? 'workflow-results__text--mono' : ''}`}>
        {text || '(空内容)'}
      </div>
    </div>
  );
}

function ImageResult({
  src,
  thumbnailSrc,
  width,
  height,
  onPreviewImage,
  compact = false,
}: {
  src: string;
  thumbnailSrc?: string;
  width?: number;
  height?: number;
  onPreviewImage: (src: string) => void;
  compact?: boolean;
}) {
  return (
    <button type="button" onClick={() => onPreviewImage(src)} className={`workflow-results__media ${compact ? 'workflow-results__media--compact' : ''}`}>
      <img src={thumbnailSrc || src} alt="" className="h-full w-full object-cover" />
      <ImageSizeLabel src={thumbnailSrc || src} width={width} height={height} className="workflow-results__media-size" />
    </button>
  );
}

function isRenderableOutputImageUrl(value: string) {
  return isLocalOrInlineMediaUrl(value) && isImageUrl(value);
}

function VideoResult({ src, compact = false }: { src: string; compact?: boolean }) {
  return (
    <div className={`workflow-results__video ${compact ? 'workflow-results__video--compact' : ''}`}>
      <video src={src} controls className="h-full w-full rounded-[inherit] object-cover" />
      <div className="workflow-results__video-label">
        <Video size={12} />
        视频输出
      </div>
    </div>
  );
}

function LogsList({
  logs,
  onClear,
}: {
  logs: Array<{ id: string; level: string; message: string; timestamp: number; details?: unknown }>;
  onClear: () => void;
}) {
  if (logs.length === 0) {
    return <EmptyState icon={<TerminalSquare size={20} />} title="还没有运行日志" body="工作流开始执行后，这里会显示节点级运行日志。" action="先执行工作流；如果执行失败，也可以回到画布检查启动前校验。" />;
  }

  const orderedLogs = [...logs].reverse();

  return (
    <div className="workflow-results__stack">
      <div className="flex justify-end">
        <button type="button" onClick={onClear} className="workflow-results__mini-action">
          清空
        </button>
      </div>
      {orderedLogs.map((log) => (
        <div key={log.id} className="workflow-results__log-item">
          <div className="workflow-results__log-head">
            <span className={`workflow-results__log-level workflow-results__log-level--${log.level}`}>{log.level}</span>
            <span>{new Date(log.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
          </div>
          <div className="workflow-results__log-message">{buildLogPreview(String(log.message), LOG_MESSAGE_PREVIEW_LIMIT)}</div>
          {Boolean(log.details) && (
            <pre className="workflow-results__text workflow-results__text--mono mt-2 whitespace-pre-wrap">
              {buildLogPreview(String(log.details), LOG_DETAILS_PREVIEW_LIMIT)}
            </pre>
          )}
        </div>
      ))}
    </div>
  );
}

function TextFileResult({
  url,
  name,
  onBackfillText,
}: {
  url: string;
  name: string;
  onBackfillText?: (text: string) => void;
}) {
  const [text, setText] = useState('');
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const openPreview = async () => {
    setIsPreviewOpen(true);
    if (text || isLoading) return;

    setIsLoading(true);
    setError('');
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setText(await response.text());
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : String(previewError));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div>
      <button type="button" onClick={() => void openPreview()} className="workflow-results__file-preview">
        <span className="workflow-results__file-icon">
          <FileText size={15} />
        </span>
        <span className="workflow-results__file-main">
          <span className="workflow-results__file-name">{name}</span>
          <span className="workflow-results__file-meta">点击查看文本内容</span>
        </span>
      </button>
      {isPreviewOpen && (
        <TextPreviewModal
          title={name}
          text={text}
          isLoading={isLoading}
          error={error}
          onClose={() => setIsPreviewOpen(false)}
          onBackfillText={onBackfillText}
        />
      )}
    </div>
  );
}

function TextPreviewModal({
  title,
  text,
  isLoading,
  error,
  onClose,
  onBackfillText,
}: {
  title: string;
  text: string;
  isLoading: boolean;
  error: string;
  onClose: () => void;
  onBackfillText?: (text: string) => void;
}) {
  return createPortal(
    <div
      className="workflow-text-preview-modal"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="workflow-text-preview-modal__dialog" onMouseDown={(event) => event.stopPropagation()}>
        <div className="workflow-text-preview-modal__header">
          <div className="min-w-0">
            <div className="workflow-text-preview-modal__title">{title}</div>
            <div className="workflow-text-preview-modal__meta">
              {isLoading ? '读取中...' : error ? '读取失败' : `${text ? text.split(/\r\n|\r|\n/).length : 0} 行 · ${text.length} 字符`}
            </div>
          </div>
          <div className="workflow-text-preview-modal__actions">
            <button
              type="button"
              onClick={() => void navigator.clipboard?.writeText(text)}
              disabled={!text || isLoading}
              className="workflow-results__mini-action"
            >
              <Clipboard size={11} />
              复制
            </button>
            {onBackfillText && (
              <button
                type="button"
                onClick={() => {
                  onBackfillText(text);
                  onClose();
                }}
                disabled={!text || isLoading || Boolean(error)}
                className="workflow-results__mini-action"
              >
                回填到画布
              </button>
            )}
            <button type="button" onClick={onClose} className="workflow-text-preview-modal__close" aria-label="关闭文本预览">
              <X size={16} />
            </button>
          </div>
        </div>
        <div className="workflow-text-preview-modal__body">
          {isLoading && (
            <div className="workflow-text-preview-modal__state">
              <Loader2 size={18} className="workflow-text-preview-modal__spinner" />
              正在读取文本内容...
            </div>
          )}
          {!isLoading && error && (
            <div className="workflow-text-preview-modal__state workflow-text-preview-modal__state--error">
              {error}
            </div>
          )}
          {!isLoading && !error && (
            <pre className="workflow-text-preview-modal__text">{text || '(空内容)'}</pre>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function buildLogPreview(value: string, limit: number) {
  if (value.length <= limit) return value;
  const head = value.slice(0, Math.floor(limit * 0.75));
  const tail = value.slice(-Math.floor(limit * 0.15));
  return `${head}\n...[log truncated ${value.length - head.length - tail.length} chars]...\n${tail}`;
}

function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  action?: string;
}) {
  return (
    <div className="workflow-results__empty">
      <div className="workflow-results__empty-icon">{icon}</div>
      <div className="workflow-results__empty-title">{title}</div>
      <div className="workflow-results__empty-body">{body}</div>
      {action && <div className="workflow-results__empty-action">{action}</div>}
    </div>
  );
}

function unwrapOutputValue(value: unknown): unknown {
  if (value && typeof value === 'object' && 'url' in (value as Record<string, unknown>)) {
    const record = value as Record<string, unknown>;
    const url = record.url;
    const type = record.type;
      if (typeof url === 'string' && typeof type === 'string') {
        return {
          url,
          thumbnailUrl: typeof record.thumbnailUrl === 'string' ? record.thumbnailUrl : '',
          type,
          name: typeof record.name === 'string' ? record.name : '',
          mimeType: typeof record.mimeType === 'string' ? record.mimeType : '',
          width: typeof record.width === 'number' ? record.width : undefined,
          height: typeof record.height === 'number' ? record.height : undefined,
      };
    }
    if (typeof record.url === 'string') return record.url;
  }
  return value;
}

function isGeneratedOutputValue(value: unknown): value is { url: string; thumbnailUrl?: string; type: string; name: string; mimeType?: string; width?: number; height?: number } {
  return Boolean(
    value
    && typeof value === 'object'
    && typeof (value as Record<string, unknown>).url === 'string'
    && typeof (value as Record<string, unknown>).type === 'string',
  );
}

function isPreviewableTextOutput(value: { type: string; name?: string; mimeType?: string }) {
  if (value.type === 'text' || value.type === 'data') return true;
  const mimeType = String(value.mimeType || '').toLowerCase();
  if (/^(text\/|application\/(json|xml|x-ndjson))/.test(mimeType)) return true;
  return /\.(txt|md|markdown|json|jsonl|csv|log|xml|yaml|yml)(\?.*)?$/i.test(String(value.name || ''));
}

function isImageUrl(value: string) {
  return /^data:image\//.test(value) || /\.(png|jpe?g|gif|webp|bmp|svg)(\?.*)?$/i.test(value);
}

function isRenderableOutputVideoUrl(value: string) {
  return isLocalOrInlineMediaUrl(value) && isVideoUrl(value);
}

function isRenderableOutputAudioUrl(value: string) {
  return isLocalOrInlineMediaUrl(value) && isAudioUrl(value);
}

function isLocalOrInlineMediaUrl(value: string) {
  return value.startsWith('data:') || value.startsWith('blob:') || value.startsWith('/api/files/') || value.startsWith('/api/outputs/');
}

function isVideoUrl(value: string) {
  return /^data:video\//.test(value) || /\.(mp4|mov|webm|m4v)(\?.*)?$/i.test(value);
}

function isAudioUrl(value: string) {
  return /^data:audio\//.test(value) || /\.(mp3|wav|ogg|m4a|aac|flac)(\?.*)?$/i.test(value);
}
