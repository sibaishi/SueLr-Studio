import type { ExecutionHistoryEntry } from '@/domains/workflow/lib/api/execution';
import type { GeneratedOutputFile } from '@/domains/workflow/lib/api/files';
import { getNodeDef } from '@/domains/workflow/lib/constants';
import { formatDurationSeconds } from '@/domains/workflow/lib/executionFormat';
import type { ExecutionLogEntry } from '@/domains/workflow/lib/store/types';
import { PanelEmptyState, PanelHeader, PanelSurface, PanelTabs } from '@/ui/PanelPrimitives';
import {
  CaretDown,
  Clipboard,
  Clock,
  FileText,
  Image,
  PlayCircle,
  TerminalWindow,
  VideoCamera,
  Warning,
} from '@phosphor-icons/react';
import { type ReactNode, useRef, useState } from 'react';
import { ImagePreviewModal } from './ImagePreviewModal';
import { ImageSizeLabel } from './ImageSizeLabel';
import { type GenerationActions, ResultGenerationDetails } from './ResultGenerationDetails';
import { inferImageThumbnailUrl } from './nodes/NodeMedia';
import { WorkflowNodeIcon } from './nodes/WorkflowNodeIcon';

type ReadableLog = ExecutionLogEntry & {
  count: number;
  compactedCount: number;
  startedAt: number;
  endedAt: number;
  detailSource?: ExecutionLogEntry;
};
const LOG_MESSAGE_PREVIEW_LIMIT = 600;
const LOG_DETAILS_PREVIEW_LIMIT = 4000;
export type PanelTab = 'results' | 'logs' | 'history';

export function ResultsPanelView({
  motionState = 'entering',
  tab,
  onTabChange,
  status,
  duration,
  tone,
  logsLabel,
  children,
}: {
  motionState?: 'entering' | 'leaving';
  tab: PanelTab;
  onTabChange: (tab: PanelTab) => void;
  status: string;
  duration: string;
  tone: 'accent' | 'danger' | 'neutral';
  logsLabel: string;
  children: ReactNode;
}) {
  return (
    <PanelSurface
      className={`workflow-panel workflow-results workflow-results--${motionState}`}
      aria-label="结果与经过"
    >
      <PanelHeader eyebrow="刚刚发生了什么" title="结果与经过" description="画布跑完后的产物和经过" />
      <div className="workflow-results__summary">
        <SummaryCard icon={<PlayCircle size={16} />} label="运行状态" value={status} tone={tone} />
        <SummaryCard icon={<Clock size={16} />} label="最近耗时" value={duration} tone="neutral" />
      </div>
      <PanelTabs
        label="结果栏内容"
        value={tab}
        onChange={onTabChange}
        options={[
          { value: 'results', label: '结果' },
          { value: 'logs', label: logsLabel },
          { value: 'history', label: '历史' },
        ]}
      />
      {children}
    </PanelSurface>
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
    <div className={`ui-panel-card workflow-results__summary-card workflow-results__summary-card--${tone}`}>
      <div className="workflow-results__summary-icon">{icon}</div>
      <div className="min-w-0">
        <div className="workflow-results__summary-label">{label}</div>
        <div className="workflow-results__summary-value">{value}</div>
      </div>
    </div>
  );
}

export function ResultsList({
  files,
  isLoading,
  error,
  onPreviewImage,
  onBackfillText,
  onReuseParameters,
  onBackfillReferences,
}: GenerationActions & {
  files: GeneratedOutputFile[];
  isLoading: boolean;
  error: string | null;
  onPreviewImage: (src: string) => void;
  onBackfillText?: (text: string) => void;
}) {
  const resultItems = files.map((file) => ({
    id: file.id,
    generation: file.generation,
    type: file.type === 'audio' ? 'audio' : file.type === 'video' ? 'videoGen' : 'imageGen',
    label: file.name,
    color: file.type === 'audio' ? 'var(--t-red)' : file.type === 'video' ? 'var(--t-purple)' : 'var(--t-blue)',
    outputLabels: { content: file.relativePath },
    outputs: {
      content: {
        url: file.url,
        thumbnailUrl: file.thumbnailUrl,
        type: file.type,
        name: file.name,
        mimeType: file.mimeType,
        width: file.width,
        height: file.height,
      },
    },
  }));

  if (error) {
    return <EmptyState icon={<Warning size={20} />} title="结果读取失败" body={error} />;
  }

  if (files.length === 0 && isLoading) {
    return (
      <EmptyState icon={<Image size={20} />} title="正在读取生成文件" body="正在从外部文件存储生成目录同步结果。" />
    );
  }

  if (files.length === 0) {
    return (
      <EmptyState
        icon={<Image size={20} />}
        title="还没有 AI 输出"
        body="执行后，这里会集中显示文本、图片、视频和音频结果。"
        action="先运行一次工作流，或检查节点是否具备可输出内容。"
      />
    );
  }

  return (
    <div className="workflow-results__stack">
      {resultItems.map(
        (item) =>
          item && (
            <div key={item.id} className="ui-panel-card workflow-results__card">
              <div className="workflow-results__card-header">
                <span
                  className="workflow-results__node-badge"
                  style={{ background: `color-mix(in srgb, ${item.color} 12%, transparent)`, color: item.color }}
                >
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
              <ResultGenerationDetails
                record={item.generation}
                onPreviewImage={onPreviewImage}
                onReuseParameters={onReuseParameters}
                onBackfillReferences={onBackfillReferences}
              />
            </div>
          ),
      )}
    </div>
  );
}

function NodeBadgeIcon({ nodeType }: { nodeType: string }) {
  const def = getNodeDef(nodeType);
  return <WorkflowNodeIcon name={nodeType === 'audio' ? 'audio' : def?.icon} size={14} />;
}

export function AiOutputGroup({
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
  const savedFiles = Array.isArray(outputs.savedFiles) ? outputs.savedFiles : [];
  const entries = Object.entries(outputs)
    .filter(([key]) => key !== 'savedFiles' && key !== 'savedPaths')
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => {
      const unwrapped = unwrapOutputValue(value);
      if (
        typeof unwrapped === 'string' &&
        unwrapped.startsWith('/api/outputs/') &&
        isRenderableOutputImageUrl(unwrapped)
      ) {
        const matched = savedFiles.find(
          (file) =>
            file &&
            typeof file === 'object' &&
            typeof (file as { url?: unknown }).url === 'string' &&
            (file as { url: string }).url === unwrapped &&
            (file as { type?: unknown }).type === 'image',
        ) as
          | {
              url: string;
              thumbnailUrl?: string;
              type: string;
              name?: string;
              mimeType?: string;
              width?: number;
              height?: number;
            }
          | undefined;
        if (matched) {
          return [key, unwrapOutputValue(matched)] as const;
        }
      }
      return [key, unwrapped] as const;
    });

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
    if (value.type === 'image')
      return (
        <ImageResult
          src={value.url}
          thumbnailSrc={value.thumbnailUrl || inferImageThumbnailUrl(value.url) || value.url}
          width={value.width}
          height={value.height}
          onPreviewImage={onPreviewImage}
        />
      );
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
      return (
        <div className="space-y-2">
          {values.map((src) => (
            <VideoResult key={src} src={src} compact />
          ))}
        </div>
      );
    }
    if (values.length === normalized.length && values.every(isRenderableOutputAudioUrl)) {
      return (
        <div className="space-y-2">
          {values.map((src) => (
            <audio key={src} src={src} controls className="w-full" />
          ))}
        </div>
      );
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
        <button type="button" onClick={() => void navigator.clipboard?.writeText(text)} className="ui-panel-button">
          <Clipboard size={10} />
          复制
        </button>
      </div>
      <div className={`workflow-results__text ${mono ? 'workflow-results__text--mono' : ''}`}>{text || '(空内容)'}</div>
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
    <button
      type="button"
      onClick={() => onPreviewImage(src)}
      aria-label="预览结果图片"
      className={`workflow-results__media ${compact ? 'workflow-results__media--compact' : ''}`}
    >
      <img src={thumbnailSrc || src} alt="" className="h-full w-full object-cover" />
      <ImageSizeLabel
        src={thumbnailSrc || src}
        width={width}
        height={height}
        className="workflow-results__media-size"
      />
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
        <VideoCamera size={12} />
        视频输出
      </div>
    </div>
  );
}

export function LogsList({
  logs,
  onClear,
}: {
  logs: ExecutionLogEntry[];
  onClear: () => void;
}) {
  if (logs.length === 0) {
    return (
      <EmptyState
        icon={<TerminalWindow size={20} />}
        title="还没有记录"
        body="跑一次画布，每一步的进度和结果会在这里展开。"
        action="如果没跑通，回画布检查启动前校验。"
      />
    );
  }

  const readableLogs = buildReadableLogs(logs);
  const orderedLogs = [...readableLogs].reverse();
  const compactedCount = Math.max(0, logs.length - readableLogs.length);

  return (
    <div className="workflow-results__stack">
      <div className="workflow-results__log-toolbar">
        <span>共 {readableLogs.length} 条</span>
        {compactedCount > 0 && <span>已折叠 {compactedCount} 条细节</span>}
        <button type="button" onClick={onClear} className="ui-panel-button">
          清空
        </button>
      </div>
      {orderedLogs.map((log) => (
        <div key={log.id} className="ui-panel-card workflow-results__log-item">
          <div className="workflow-results__log-head">
            <span className={`workflow-results__log-level workflow-results__log-level--${log.level}`}>{log.level}</span>
            <span>{formatReadableLogTime(log)}</span>
          </div>
          <div className="workflow-results__log-message">
            {buildLogPreview(String(log.message), LOG_MESSAGE_PREVIEW_LIMIT)}
          </div>
          {log.count > 1 && (
            <div className="workflow-results__log-meta">
              {log.count} 次处理细节{log.compactedCount > 0 ? `，已收起 ${log.compactedCount} 条` : ''}
            </div>
          )}
          {Boolean(log.detailSource?.details) && (
            <pre className="workflow-results__text workflow-results__text--mono mt-2 whitespace-pre-wrap">
              {buildLogPreview(String(log.detailSource?.details), LOG_DETAILS_PREVIEW_LIMIT)}
            </pre>
          )}
        </div>
      ))}
    </div>
  );
}

export function buildReadableLogs(logs: ExecutionLogEntry[]): ReadableLog[] {
  const nodeGroups = new Map<string, ExecutionLogEntry[]>();
  const directLogs: ReadableLog[] = [];

  logs.forEach((log, index) => {
    if (log.nodeId) {
      const nodeLogs = nodeGroups.get(log.nodeId) || [];
      nodeLogs.push(log);
      nodeGroups.set(log.nodeId, nodeLogs);
      return;
    }

    const isBoundaryLog = index === 0 || index === logs.length - 1;
    if (log.level === 'info' && !isBoundaryLog) return;
    directLogs.push(toReadableDirectLog(log));
  });

  const groupedLogs = Array.from(nodeGroups.values()).map(toReadableNodeLog);
  return [...directLogs, ...groupedLogs].sort((left, right) => left.startedAt - right.startedAt);
}

function toReadableDirectLog(log: ExecutionLogEntry): ReadableLog {
  return {
    ...log,
    count: 1,
    compactedCount: 0,
    startedAt: log.timestamp,
    endedAt: log.timestamp,
    detailSource: log.level === 'error' ? log : undefined,
  };
}

function toReadableNodeLog(nodeLogs: ExecutionLogEntry[]): ReadableLog {
  const ordered = [...nodeLogs].sort((left, right) => left.timestamp - right.timestamp);
  const first = ordered[0];
  const errors = ordered.filter((log) => log.level === 'error');
  const successes = ordered.filter((log) => log.level === 'success');
  const primary = errors.at(-1) || successes.at(-1) || ordered.at(-1) || first;

  return {
    ...primary,
    id: `readable_${first.nodeId || first.id}_${first.timestamp}`,
    count: ordered.length,
    compactedCount: Math.max(0, ordered.length - 1),
    startedAt: first.timestamp,
    endedAt: ordered.at(-1)?.timestamp || first.timestamp,
    detailSource: errors.at(-1),
  };
}

function formatReadableLogTime(log: ReadableLog) {
  const startedAt = formatLogTime(log.startedAt);
  if (!log.endedAt || log.endedAt === log.startedAt) return startedAt;
  return `${startedAt} - ${formatLogTime(log.endedAt)}`;
}

function formatLogTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function formatLogsTabLabel(readableCount: number, rawCount: number) {
  if (rawCount === 0) return '记录';
  if (readableCount === rawCount) return `记录 ${rawCount}`;
  return `记录 ${readableCount}/${rawCount}`;
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
  const textFetchedRef = useRef(false);

  const openPreview = async () => {
    setIsPreviewOpen(true);
    if (textFetchedRef.current) return;
    textFetchedRef.current = true;
    try {
      const response = await fetch(url);
      if (response.ok) setText(await response.text());
    } catch {
      // 文本文件应该始终可访问，忽略 fetch 失败
    }
  };

  const lines = text ? text.split(/\r\n|\r|\n/).length : 0;
  const titleWithMeta = `${name}  ·  ${lines} 行  ·  ${text.length} 字符`;

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
        <ImagePreviewModal
          src=""
          textContent={text || '（加载中……）'}
          title={titleWithMeta}
          renderTextActions={
            onBackfillText
              ? () => (
                  <button
                    type="button"
                    onClick={() => {
                      onBackfillText(text);
                      setIsPreviewOpen(false);
                    }}
                    className="workflow-image-preview-modal__icon-button"
                    title="回填到画布"
                    disabled={!text}
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <title>回填到画布</title>
                      <path d="M12 2H4a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2Z" />
                      <polyline points="8 6 8 12" />
                      <polyline points="5 9 8 12 11 9" />
                    </svg>
                  </button>
                )
              : undefined
          }
          onClose={() => setIsPreviewOpen(false)}
        />
      )}
    </div>
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
    <PanelEmptyState icon={icon} title={title} action={action}>
      {body}
    </PanelEmptyState>
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

function isGeneratedOutputValue(value: unknown): value is {
  url: string;
  thumbnailUrl?: string;
  type: string;
  name: string;
  mimeType?: string;
  width?: number;
  height?: number;
} {
  return Boolean(
    value &&
      typeof value === 'object' &&
      typeof (value as Record<string, unknown>).url === 'string' &&
      typeof (value as Record<string, unknown>).type === 'string',
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
  return (
    value.startsWith('data:') ||
    value.startsWith('blob:') ||
    value.startsWith('/api/files/') ||
    value.startsWith('/api/outputs/')
  );
}

function isVideoUrl(value: string) {
  return /^data:video\//.test(value) || /\.(mp4|mov|webm|m4v)(\?.*)?$/i.test(value);
}

function isAudioUrl(value: string) {
  return /^data:audio\//.test(value) || /\.(mp3|wav|ogg|m4a|aac|flac)(\?.*)?$/i.test(value);
}

export function RunHistoryList({
  entries,
  error = '',
  recoveryError = '',
  recovering = null,
  onRefresh,
  onRecover,
}: {
  entries: ExecutionHistoryEntry[] | null;
  error?: string;
  recoveryError?: string;
  recovering?: string | null;
  onRefresh: () => void;
  onRecover: (runId: string, recoveryId: string) => void;
}) {
  const [runIdCopy, setRunIdCopy] = useState<{ id: string; succeeded: boolean }>();
  const statuses: Record<string, { label: string; tone: string }> = {
    running: { label: '运行中', tone: 'info' },
    completed: { label: '已完成', tone: 'success' },
    failed: { label: '失败', tone: 'error' },
    cancelled: { label: '已停止', tone: 'neutral' },
    interrupted: { label: '运行中断', tone: 'error' },
  };
  return (
    <div className="workflow-results__stack">
      <div className="workflow-results__log-toolbar">
        {entries && <span>共 {entries.length} 条</span>}
        <button type="button" className="ui-panel-button" onClick={onRefresh}>
          刷新历史
        </button>
      </div>
      {(error || recoveryError) && (
        <div className="workflow-results__banner workflow-results__banner--warning" role="alert">
          {error || recoveryError}
        </div>
      )}
      {!entries && !error && <p className="workflow-results__log-message">正在读取运行历史…</p>}
      {entries?.length === 0 && (
        <PanelEmptyState icon={<Clock size={20} />} title="还没有运行历史">
          当前工作流还没有历史记录。
        </PanelEmptyState>
      )}
      {entries?.map((entry) => {
        const status = statuses[entry.status] ?? { label: entry.status, tone: 'neutral' };
        const startedAt = new Date(entry.startedAt);
        const duration = formatDurationSeconds(entry.totalDuration);
        return (
          <details
            key={entry.runId}
            className="ui-panel-card workflow-results__log-item workflow-results__history-item"
          >
            <summary className="workflow-results__history-summary">
              <span className="workflow-results__log-head">
                <span className={`workflow-results__log-level workflow-results__log-level--${status.tone}`}>
                  {status.label}
                </span>
                <time dateTime={startedAt.toISOString()}>{startedAt.toLocaleString('zh-CN')}</time>
              </span>
              <span className="workflow-results__history-overview">
                <span className="workflow-results__log-message">
                  {entry.nodeCount} 个节点{duration && ` · 耗时 ${duration}`}
                </span>
                <CaretDown className="workflow-results__history-caret" size={14} aria-hidden="true" />
              </span>
            </summary>
            <div className="workflow-results__history-details workflow-results__log-message">
              <div>
                <p className="break-all select-text">运行 ID · {entry.runId}</p>
                <button
                  type="button"
                  className="ui-panel-button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(entry.runId);
                      setRunIdCopy({ id: entry.runId, succeeded: true });
                    } catch {
                      setRunIdCopy({ id: entry.runId, succeeded: false });
                    }
                  }}
                >
                  复制运行 ID
                </button>
                {runIdCopy?.id === entry.runId && (
                  <span className="ml-2" role="status">
                    {runIdCopy.succeeded ? '已复制' : '复制失败'}
                  </span>
                )}
              </div>
              {entry.inputs
                ?.filter((input) => input.text || input.files.length > 0)
                .map((input) => (
                  <div key={input.nodeId} className="break-all">
                    <strong>输入 · {input.nodeId}</strong>
                    {input.text && <p className="whitespace-pre-wrap">{input.text}</p>}
                    {input.files.map((url, index) => (
                      <p key={url}>
                        <a className="underline" href={url} download>
                          下载输入素材 {index + 1}
                        </a>
                      </p>
                    ))}
                  </div>
                ))}
              {entry.error && <p>{entry.error}</p>}
              {entry.failures.map((failure, index) => (
                <p key={`${failure.nodeId}-${index}`}>
                  {failure.nodeId} · {failure.error}
                </p>
              ))}
              {entry.recoverableVideos.map((task) => (
                <button
                  key={task.id}
                  type="button"
                  className="ui-panel-button"
                  disabled={Boolean(recovering)}
                  onClick={() => void onRecover(entry.runId, task.id)}
                >
                  {recovering === task.id ? '正在取回视频…' : `取回视频 · ${task.nodeId}`}
                </button>
              ))}
              {entry.outputs.map((url, index) => (
                <p key={url}>
                  <a className="underline" href={url} download>
                    下载产物 {index + 1}
                  </a>
                </p>
              ))}
            </div>
          </details>
        );
      })}
    </div>
  );
}
