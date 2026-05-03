import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clipboard, Clock3, ImageIcon, PlayCircle, TerminalSquare, Video } from 'lucide-react';
import { getNodeDef } from '@/features/workflow/lib/constants';
import { NODE_ICONS } from '@/features/workflow/components/nodes/nodeConstants';
import { useWorkflowStore } from '@/features/workflow/lib/store';
import { ImagePreviewModal } from '@/features/workflow/components/ImagePreviewModal';
import { ImageSizeLabel } from '@/features/workflow/components/ImageSizeLabel';
import { formatDurationSeconds, getExecutionStatusLabel } from '@/features/workflow/lib/executionFormat';

const RESULT_NODE_TYPES = new Set(['aiChat', 'imageGen', 'videoGen', 'output']);

type PanelTab = 'results' | 'logs';

export default function ResultsPanel() {
  const [tab, setTab] = useState<PanelTab>('results');
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const nodes = useWorkflowStore((s) => s.nodes);
  const nodeOutputs = useWorkflowStore((s) => s.nodeOutputs);
  const executionLogs = useWorkflowStore((s) => s.executionLogs);
  const lastExecutionStatus = useWorkflowStore((s) => s.lastExecutionStatus);
  const lastExecutionTime = useWorkflowStore((s) => s.lastExecutionTime);
  const isExecuting = useWorkflowStore((s) => s.isExecuting);
  const workflowWarningMessage = useWorkflowStore((s) => s.workflowWarningMessage);
  const nodeWarnings = useWorkflowStore((s) => s.nodeWarnings);
  const selectedNodeId = useWorkflowStore((s) => s.selectedNodeId);
  const clearExecutionLogs = useWorkflowStore((s) => s.clearExecutionLogs);

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

  const resultItems = useMemo(() => {
    return nodes
      .filter((node) => RESULT_NODE_TYPES.has(node.type || ''))
      .map((node) => {
        const outputs = nodeOutputs[node.id];
        if (!outputs) return null;
        const def = getNodeDef(node.type || '');
        return {
          id: node.id,
          type: node.type || '',
          label: def?.label || node.type || node.id,
          color: def?.color || '#8E8E93',
          outputLabels: Object.fromEntries((def?.outputs || []).map((output) => [output.id, output.label])),
          outputs,
        };
      })
      .filter(Boolean);
  }, [nodeOutputs, nodes]);

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
          <ResultsList resultItems={resultItems} selectedMaskInfo={selectedMaskInfo} onPreviewImage={setPreviewImage} />
        ) : (
          <LogsList logs={executionLogs} onClear={clearExecutionLogs} />
        )}
      </div>

      {previewImage && <ImagePreviewModal src={previewImage} onClose={() => setPreviewImage(null)} />}
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
  resultItems,
  selectedMaskInfo,
  onPreviewImage,
}: {
  resultItems: Array<{
    id: string;
    type: string;
    label: string;
    color: string;
    outputLabels: Record<string, string>;
    outputs: Record<string, unknown>;
  } | null>;
  selectedMaskInfo: { label: string; src: string; hasMask: boolean } | null;
  onPreviewImage: (src: string) => void;
}) {
  if (resultItems.length === 0 && !selectedMaskInfo?.hasMask) {
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
          <AiOutputGroup outputs={item.outputs} outputLabels={item.outputLabels} onPreviewImage={onPreviewImage} />
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
}: {
  outputs: Record<string, unknown>;
  outputLabels: Record<string, string>;
  onPreviewImage: (src: string) => void;
}) {
  const entries = Object.entries(outputs)
    .filter(([key]) => key !== 'savedFiles' && key !== 'savedPaths')
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => [key, unwrapOutputValue(value)] as const);

  if (entries.length === 0) return <TextResult text="" />;

  if (entries.length === 1) {
    return <AiOutputValue value={entries[0][1]} onPreviewImage={onPreviewImage} />;
  }

  return (
    <div className="workflow-results__group">
      {entries.map(([key, value]) => (
        <div key={key}>
          <div className="workflow-results__group-label">{outputLabels[key] || key}</div>
          <AiOutputValue value={value} onPreviewImage={onPreviewImage} />
        </div>
      ))}
    </div>
  );
}

function AiOutputValue({ value, onPreviewImage }: { value: unknown; onPreviewImage: (src: string) => void }) {
  if (typeof value === 'string') {
    if (isVisualAssetUrl(value)) return <ImageResult src={value} onPreviewImage={onPreviewImage} />;
    if (isVideoUrl(value)) return <VideoResult src={value} />;
    if (isAudioUrl(value)) return <audio src={value} controls className="w-full" />;
    return <TextResult text={value} />;
  }

  if (Array.isArray(value)) {
    const normalized = value.map(unwrapOutputValue);
    const values = normalized.filter((item): item is string => typeof item === 'string');
    if (values.length === normalized.length && values.every(isVisualAssetUrl)) {
      return (
        <div className="grid grid-cols-2 gap-2">
          {values.map((src, index) => (
            <ImageResult key={`${src}-${index}`} src={src} onPreviewImage={onPreviewImage} compact />
          ))}
        </div>
      );
    }
    if (values.length === normalized.length && values.every(isVideoUrl)) {
      return <div className="space-y-2">{values.map((src) => <VideoResult key={src} src={src} compact />)}</div>;
    }
    if (values.length === normalized.length && values.every(isAudioUrl)) {
      return <div className="space-y-2">{values.map((src) => <audio key={src} src={src} controls className="w-full" />)}</div>;
    }
    return <TextResult text={JSON.stringify(normalized, null, 2)} mono />;
  }

  return <TextResult text={JSON.stringify(value, null, 2)} mono />;
}

function TextResult({ text, mono = false }: { text: string; mono?: boolean }) {
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
  onPreviewImage,
  compact = false,
}: {
  src: string;
  onPreviewImage: (src: string) => void;
  compact?: boolean;
}) {
  return (
    <button type="button" onClick={() => onPreviewImage(src)} className={`workflow-results__media ${compact ? 'workflow-results__media--compact' : ''}`}>
      <img src={src} alt="" className="h-full w-full object-cover" />
      <ImageSizeLabel src={src} className="workflow-results__media-size" />
    </button>
  );
}

function isVisualAssetUrl(value: string) {
  return isImageUrl(value) || isMaskLikeUrl(value);
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
          <div className="workflow-results__log-message">{String(log.message)}</div>
          {Boolean(log.details) && <pre className="workflow-results__text workflow-results__text--mono mt-2 whitespace-pre-wrap">{String(log.details)}</pre>}
        </div>
      ))}
    </div>
  );
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
      {action && <div className="workflow-results__empty-body">{action}</div>}
    </div>
  );
}

function unwrapOutputValue(value: unknown): unknown {
  if (value && typeof value === 'object' && 'url' in (value as Record<string, unknown>)) {
    const url = (value as Record<string, unknown>).url;
    if (typeof url === 'string') return url;
  }
  return value;
}

function isImageUrl(value: string) {
  return /^data:image\//.test(value) || /\.(png|jpe?g|gif|webp|bmp|svg)(\?.*)?$/i.test(value);
}

function isMaskLikeUrl(value: string) {
  return value.startsWith('blob:') || /^https?:\/\//i.test(value) || value.startsWith('/');
}

function isVideoUrl(value: string) {
  return /^data:video\//.test(value) || /\.(mp4|mov|webm|m4v)(\?.*)?$/i.test(value);
}

function isAudioUrl(value: string) {
  return /^data:audio\//.test(value) || /\.(mp3|wav|ogg|m4a|aac|flac)(\?.*)?$/i.test(value);
}
