import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { testApiConnection, uploadFile } from '@/domains/workflow/lib/api';
import { GROUP_SAFE_MARGIN } from '@/domains/workflow/lib/groupLayout';
import { getNodeDef } from '@/domains/workflow/lib/constants';
import { MediaCard, MediaPreview, TextCard, isMediaUrl } from './NodeMedia';
import { NodeParamFields } from './NodeParamFields';
import { NODE_API_PROVIDER_CONFIG } from './nodeConstants';
import { LongTextEditorModal } from './LongTextEditorModal';
import { PromptHelperNodeCard, PromptHelperWorkbenchModal } from './PromptHelperWorkbench';
import { useBufferedStringField } from './useBufferedStringField';

type NodeDef = ReturnType<typeof getNodeDef>;

function formatModelDetectError(message?: string | null) {
  const detail = String(message || '').trim();
  return detail
    ? `模型检测没有完成，请检查 API Key、Base URL 或稍后重试。${detail}`
    : '模型检测没有完成，请检查 API Key、Base URL 或稍后重试。';
}

function getBoolean(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback;
}

function removeDelimitedRanges(sourceText: string, {
  startToken,
  endToken,
  removeStartToken,
  removeEndToken,
  removeAllRanges,
}: {
  startToken: string;
  endToken: string;
  removeStartToken: boolean;
  removeEndToken: boolean;
  removeAllRanges: boolean;
}) {
  if (!startToken || !endToken) return sourceText;

  let output = '';
  let cursor = 0;

  while (cursor < sourceText.length) {
    const startIndex = sourceText.indexOf(startToken, cursor);
    if (startIndex === -1) {
      output += sourceText.slice(cursor);
      break;
    }

    const contentStart = startIndex + startToken.length;
    const endIndex = sourceText.indexOf(endToken, contentStart);
    if (endIndex === -1) {
      output += sourceText.slice(cursor);
      break;
    }

    output += sourceText.slice(cursor, startIndex);
    if (!removeStartToken) output += startToken;
    if (!removeEndToken) output += endToken;

    cursor = endIndex + endToken.length;
    if (!removeAllRanges) {
      output += sourceText.slice(cursor);
      break;
    }
  }

  return output;
}

function trimBoundaryBlankLines(text: string) {
  return String(text)
    .replace(/^(?:[ \t]*\r?\n)+/, '')
    .replace(/(?:\r?\n[ \t]*)+$/, '');
}

function buildTextCleanPreview(data: Record<string, unknown>, outputs?: Record<string, unknown>) {
  if (typeof outputs?.text === 'string') return outputs.text;
  const text = String(data.previewText ?? data.text ?? '');
  return trimBoundaryBlankLines(removeDelimitedRanges(text, {
    startToken: String(data.startToken ?? '<think>'),
    endToken: String(data.endToken ?? '</think>'),
    removeStartToken: getBoolean(data.removeStartToken, true),
    removeEndToken: getBoolean(data.removeEndToken, true),
    removeAllRanges: getBoolean(data.removeAllRanges, true),
  }));
}

function trimSeparatorAdjacentNewlines(text: string) {
  return String(text)
    .replace(/^[ \t]*(?:\r?\n)+/, '')
    .replace(/(?:\r?\n)+[ \t]*$/, '');
}

function trimSeparatorLeadingNewlines(text: string) {
  return String(text).replace(/^[ \t]*(?:\r?\n)+/, '');
}

function getTextSplitOutputCount(data: Record<string, unknown>) {
  const requestedOutputCount = Number(data.outputCount ?? 2);
  return Math.max(1, Math.min(9, Number.isFinite(requestedOutputCount) ? Math.trunc(requestedOutputCount) : 2));
}

function splitTextIntoSegments(sourceText: string, separator: string, outputCount: number) {
  const parts: string[] = [];
  let cursor = 0;

  for (let index = 0; index < outputCount - 1; index += 1) {
    const separatorIndex = sourceText.indexOf(separator, cursor);
    if (separatorIndex === -1) break;
    parts.push(trimSeparatorAdjacentNewlines(sourceText.slice(cursor, separatorIndex)));
    cursor = separatorIndex + separator.length;
  }

  parts.push(trimSeparatorLeadingNewlines(sourceText.slice(cursor)));
  while (parts.length < outputCount) parts.push('');
  return parts.slice(0, outputCount);
}

function getStoredTextSplitSegments(data: Record<string, unknown>) {
  return Array.isArray(data.segments) ? data.segments.map((item) => String(item ?? '')) : null;
}

function normalizeTextSplitSegments(segments: string[], outputCount: number) {
  return Array.from({ length: outputCount }, (_, index) => segments[index] ?? '');
}

function buildTextSplitLocalSegments(data: Record<string, unknown>) {
  const outputCount = getTextSplitOutputCount(data);
  const storedSegments = getStoredTextSplitSegments(data);
  if (storedSegments) {
    return normalizeTextSplitSegments(storedSegments, outputCount);
  }

  const sourceText = String(data.previewText ?? data.text ?? '');
  const rawSeparator = data.separator;
  const separator = typeof rawSeparator === 'string' && rawSeparator.length > 0 ? rawSeparator : '\n';
  return splitTextIntoSegments(sourceText, separator, outputCount);
}

function buildTextSplitPreview(data: Record<string, unknown>, outputs?: Record<string, unknown>) {
  const outputCount = getTextSplitOutputCount(data);
  const outputEntries = Object.entries(outputs || {})
    .filter(([key]) => /^part\d+$/.test(key))
    .sort(([keyA], [keyB]) => Number(keyA.replace('part', '')) - Number(keyB.replace('part', '')))
    .map(([, value]) => String(value ?? ''));

  return outputEntries.length > 0 ? normalizeTextSplitSegments(outputEntries, outputCount) : buildTextSplitLocalSegments(data);
}

interface NodeContentProps {
  type: string;
  data: Record<string, unknown>;
  nodeId: string;
  def: NodeDef;
  updateNodeData: (nodeId: string, data: Record<string, unknown>) => void;
  outputs?: Record<string, unknown>;
  showBottomBorder: boolean;
  connectedInputCount?: number;
}

export function NodeContent({
  type,
  data,
  nodeId,
  updateNodeData,
  outputs,
  showBottomBorder,
  connectedInputCount,
  def,
}: NodeContentProps) {
  const outerStyle: CSSProperties = {
    flex: '1 1 auto',
    minHeight: 0,
    minWidth: 0,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  };

  switch (type) {
    case 'group':
      return <GroupNodeContent outerStyle={outerStyle} collapsed={Boolean(data.collapsed)} />;
    case 'textInput':
      return <TextInputContent data={data} nodeId={nodeId} updateNodeData={updateNodeData} outerStyle={outerStyle} />;
    case 'imageInput':
      return <FileInputContent data={data} nodeId={nodeId} updateNodeData={updateNodeData} outerStyle={outerStyle} accept="image/*" placeholder="选择图片..." label="图片" />;
    case 'maskInput':
      return <MaskInputContent data={data} nodeId={nodeId} updateNodeData={updateNodeData} outerStyle={outerStyle} />;
    case 'imageResize':
    case 'imageCompare':
      return type === 'imageCompare'
        ? <ImageCompareContent outputs={outputs} outerStyle={outerStyle} />
        : (
          <NodeSettingsContent
            params={def?.params || []}
            nodeType={type}
            nodeId={nodeId}
            data={data}
            outerStyle={outerStyle}
            onChange={(paramId, value) => updateNodeData(nodeId, { [paramId]: value })}
            onPatch={(patch) => updateNodeData(nodeId, patch)}
          />
        );
    case 'promptHelper':
      return <PromptHelperContent data={data} nodeId={nodeId} updateNodeData={updateNodeData} outputs={outputs} outerStyle={outerStyle} />;
    case 'aiChat':
    case 'imageGen':
    case 'videoGen':
    case 'saveFile':
      return (
        <NodeSettingsContent
          params={def?.params || []}
          nodeType={type}
          nodeId={nodeId}
          data={data}
          outerStyle={outerStyle}
          onChange={(paramId, value) => updateNodeData(nodeId, { [paramId]: value })}
          onPatch={(patch) => updateNodeData(nodeId, patch)}
        />
      );
    case 'textClean':
      return (
        <TextResultPreviewContent
          params={def?.params || []}
          nodeType={type}
          nodeId={nodeId}
          data={data}
          outputs={outputs}
          outerStyle={outerStyle}
          onChange={(paramId, value) => updateNodeData(nodeId, { [paramId]: value })}
          onPatch={(patch) => updateNodeData(nodeId, patch)}
          mode="clean"
        />
      );
    case 'textSplit':
      return (
        <TextResultPreviewContent
          params={def?.params || []}
          nodeType={type}
          nodeId={nodeId}
          data={data}
          outputs={outputs}
          outerStyle={outerStyle}
          onChange={(paramId, value) => updateNodeData(nodeId, { [paramId]: value })}
          onPatch={(patch) => updateNodeData(nodeId, patch)}
          mode="split"
        />
      );
    case 'videoInput':
      return <FileInputContent data={data} nodeId={nodeId} updateNodeData={updateNodeData} outerStyle={outerStyle} accept="video/*" placeholder="选择视频..." label="视频" />;
    case 'audioInput':
      return <FileInputContent data={data} nodeId={nodeId} updateNodeData={updateNodeData} outerStyle={outerStyle} accept="audio/*" placeholder="选择音频..." label="音频" />;
    case 'apiKeyInput':
      return <ApiKeyContent data={data} nodeId={nodeId} updateNodeData={updateNodeData} outerStyle={outerStyle} />;
    case 'textMerge':
    case 'imageMerge':
    case 'videoMerge':
    case 'audioMerge':
      return <MergeContent connectedCount={connectedInputCount || 0} maxInputs={def?.maxInputs || 9} outerStyle={outerStyle} />;
    case 'iterateRun':
      return <MergeContent connectedCount={connectedInputCount || 0} maxInputs={def?.maxInputs || 9} outerStyle={outerStyle} note="按端口顺序逐项运行" />;
    case 'iterateImageRun':
      return <MergeContent connectedCount={connectedInputCount || 0} maxInputs={def?.maxInputs || 9} outerStyle={outerStyle} note="按端口顺序逐张运行" />;
    case 'output':
      return <OutputContent outputs={outputs} outerStyle={outerStyle} isLastSection={!showBottomBorder} />;
    default:
      return null;
  }
}

function PromptHelperContent({
  data,
  nodeId,
  updateNodeData,
  outputs,
  outerStyle,
}: {
  data: Record<string, unknown>;
  nodeId: string;
  updateNodeData: (nodeId: string, data: Record<string, unknown>) => void;
  outputs?: Record<string, unknown>;
  outerStyle: CSSProperties;
}) {
  const [isWorkbenchOpen, setIsWorkbenchOpen] = useState(false);

  return (
    <div className="node-content-shell prompt-helper-node" style={outerStyle}>
      <PromptHelperNodeCard data={data} outputs={outputs} onOpen={() => setIsWorkbenchOpen(true)} />
      {isWorkbenchOpen && (
        <PromptHelperWorkbenchModal
          data={data}
          onPatch={(patch) => updateNodeData(nodeId, patch)}
          onClose={() => setIsWorkbenchOpen(false)}
        />
      )}
    </div>
  );
}

function GroupNodeContent({ outerStyle, collapsed }: { outerStyle: CSSProperties; collapsed: boolean }) {
  if (collapsed) return null;

  return (
    <div
      className="node-content-shell node-content-shell--group"
      style={{
        ...outerStyle,
        padding: GROUP_SAFE_MARGIN,
      }}
    >
      <div className="node-group-content">
        Nodes inside the group stay together and can be moved, copied, disabled, deleted, or ungrouped as a unit.
      </div>
    </div>
  );
}

function GroupContent({ outerStyle }: { outerStyle: CSSProperties }) {
  return (
    <div
      className="node-content-shell node-content-shell--group"
      style={{
        ...outerStyle,
        padding: GROUP_SAFE_MARGIN,
      }}
    >
      <div className="node-group-content">
        组内节点会跟随一起移动，可整体复制、禁用、删除或解组。
      </div>
    </div>
  );
}

void GroupContent;

function TextInputContent({
  data,
  nodeId,
  updateNodeData,
  outerStyle,
}: {
  data: Record<string, unknown>;
  nodeId: string;
  updateNodeData: (nodeId: string, data: Record<string, unknown>) => void;
  outerStyle: CSSProperties;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [isFullscreenEditing, setIsFullscreenEditing] = useState(false);
  const previewClickTimerRef = useRef<number | null>(null);
  const text = (data.text as string) || '';
  const lineCount = text ? text.split(/\r\n|\r|\n/).length : 0;
  const showLongTextHint = text.length > 1000;
  const editor = useBufferedStringField(text, (nextValue) => updateNodeData(nodeId, { text: nextValue }));

  useEffect(() => {
    return () => {
      if (previewClickTimerRef.current !== null) {
        window.clearTimeout(previewClickTimerRef.current);
      }
    };
  }, []);

  const handlePreviewClick = () => {
    if (previewClickTimerRef.current !== null) {
      window.clearTimeout(previewClickTimerRef.current);
    }
    previewClickTimerRef.current = window.setTimeout(() => {
      previewClickTimerRef.current = null;
      setIsEditing(true);
    }, 180);
  };

  const handlePreviewDoubleClick = () => {
    if (previewClickTimerRef.current !== null) {
      window.clearTimeout(previewClickTimerRef.current);
      previewClickTimerRef.current = null;
    }
    setIsFullscreenEditing(true);
  };

  return (
    <div className="node-content-shell node-content-shell--text" style={outerStyle}>
      {isEditing ? (
        <textarea
          value={editor.value}
          onChange={(event) => editor.onChange(event.target.value)}
          onBlur={(event) => {
            editor.onBlur(event.target.value);
            setIsEditing(false);
          }}
          autoFocus
          onFocus={() => editor.onFocus()}
          onCompositionStart={() => editor.onCompositionStart()}
          onCompositionEnd={(event) => editor.onCompositionEnd(event.currentTarget.value)}
          className="node-text-editor nodrag"
          placeholder="粘贴/输入文本..."
          onDoubleClick={() => setIsFullscreenEditing(true)}
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        />
      ) : (
        <div
          onClick={handlePreviewClick}
          onDoubleClick={handlePreviewDoubleClick}
          className={`node-text-preview${text ? '' : ' node-text-preview--empty'}`}
          title={showLongTextHint ? '单击编辑文本，双击全屏编辑' : '单击编辑文本'}
        >
          {text || '粘贴/输入文本...'}
        </div>
      )}
      <div className="node-text-meta">
        <span>
          {showLongTextHint ? `${lineCount} 行 · ${text.length} 字符 · 双击可全屏编辑` : `${lineCount} 行 · ${text.length} 字符`}
        </span>
      </div>
      {isFullscreenEditing && (
        <LongTextEditorModal
          title="编辑文本输入"
          value={editor.value}
          onChange={(nextValue) => editor.onChange(nextValue)}
          onClose={() => setIsFullscreenEditing(false)}
          onCompositionStart={() => editor.onCompositionStart()}
          onCompositionEnd={(nextValue) => editor.onCompositionEnd(nextValue)}
        />
      )}
    </div>
  );
}

function FileInputContent({
  data,
  nodeId,
  updateNodeData,
  outerStyle,
  accept,
  placeholder,
  label,
}: {
  data: Record<string, unknown>;
  nodeId: string;
  updateNodeData: (nodeId: string, data: Record<string, unknown>) => void;
  outerStyle: CSSProperties;
  accept: string;
  placeholder: string;
  label: string;
}) {
  const fileUrl = (data.fileUrl as string) || '';
  const thumbnailUrl = (data.thumbnailUrl as string) || '';
  const storedPreviewUrl = (data.previewUrl as string) || '';
  const previewUrl = storedPreviewUrl && !(storedPreviewUrl.startsWith('blob:') && fileUrl) ? storedPreviewUrl : fileUrl;
  const previewDisplayUrl = thumbnailUrl || previewUrl;
  const fileName = (data.fileName as string) || '';
  const localPath = (data.localPath as string) || '';
  const uploading = Boolean(data._uploading);
  const uploadError = (data._uploadError as string) || '';
  const maskFileUrl = (data.maskFileUrl as string) || '';
  const maskPreviewUrl = (data.maskPreviewUrl as string) || '';
  const maskUploadError = (data._maskUploadError as string) || '';
  const maskUploading = Boolean(data._maskUploading);
  const mediaKind = accept.startsWith('image') ? 'image' : accept.startsWith('video') ? 'video' : 'audio';
  const maskSource = maskPreviewUrl && !(maskPreviewUrl.startsWith('blob:') && maskFileUrl) ? maskPreviewUrl : maskFileUrl;
  const [maskContentState, setMaskContentState] = useState<'empty' | 'present'>('empty');
  const hasGeneratedMask = maskContentState === 'present';
  const hasOriginalCanvasImage = Boolean(data.canvasOriginalFileUrl || data.canvasOriginalPreviewUrl);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const localPathField = useBufferedStringField(localPath, (nextPath) => {
    if (!nextPath) {
      updateNodeData(nodeId, {
        localPath: '',
        fileUrl: '',
        previewUrl: '',
        fileName: '',
        fileSize: undefined,
        _uploading: false,
        _uploadError: '',
        canvasOriginalFileUrl: '',
        canvasOriginalPreviewUrl: '',
        canvasOriginalFileName: '',
        canvasOriginalFileSize: undefined,
      });
      return;
    }

    updateNodeData(nodeId, { localPath: nextPath });
  });

  const formatUploadError = useCallback((message?: string | null) => {
    const detail = String(message || '').trim();
    return detail
      ? `上传没有完成，请检查文件格式、大小或稍后重试。${detail}`
      : '上传没有完成，请检查文件格式、大小或稍后重试。';
  }, []);

  const uploadSelectedFile = useCallback(async (file: File) => {
    if (!file) return;

    const localPreview = URL.createObjectURL(file);
    updateNodeData(nodeId, {
      fileUrl: '',
      thumbnailUrl: '',
      previewUrl: localPreview,
      localPath: file.webkitRelativePath || file.name,
      fileName: file.name,
      fileKind: mediaKind,
      fileSize: file.size,
      _uploading: true,
      _uploadError: '',
      canvasOriginalFileUrl: '',
      canvasOriginalPreviewUrl: '',
      canvasOriginalFileName: '',
      canvasOriginalFileSize: undefined,
    });

    try {
      const result = await uploadFile(file);
      if (result.success && result.url) {
        URL.revokeObjectURL(localPreview);
        updateNodeData(nodeId, {
          fileUrl: result.url,
          thumbnailUrl: result.thumbnailUrl || '',
          previewUrl: result.url,
          fileName: result.fileName || file.name,
          fileSize: result.fileSize || file.size,
          _uploading: false,
          _uploadError: '',
        });
      } else {
        URL.revokeObjectURL(localPreview);
        updateNodeData(nodeId, { previewUrl: '', _uploading: false, _uploadError: formatUploadError(result.error) });
      }
    } catch (error) {
      URL.revokeObjectURL(localPreview);
      updateNodeData(nodeId, { previewUrl: '', _uploading: false, _uploadError: formatUploadError(error instanceof Error ? error.message : '') });
    }
  }, [formatUploadError, mediaKind, nodeId, updateNodeData]);

  const handleFileChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) await uploadSelectedFile(file);
    event.target.value = '';
  }, [uploadSelectedFile]);

  const restoreOriginalCanvasImage = useCallback(() => {
    const originalFileUrl = (data.canvasOriginalFileUrl as string) || '';
    const originalPreviewUrl = (data.canvasOriginalPreviewUrl as string) || '';
    if (!originalFileUrl && !originalPreviewUrl) return;

    updateNodeData(nodeId, {
      fileUrl: originalFileUrl,
      previewUrl: originalPreviewUrl || originalFileUrl,
      fileName: (data.canvasOriginalFileName as string) || fileName,
      fileSize: typeof data.canvasOriginalFileSize === 'number' ? data.canvasOriginalFileSize : data.fileSize,
      _uploading: false,
      _uploadError: '',
      canvasOriginalFileUrl: '',
      canvasOriginalPreviewUrl: '',
      canvasOriginalFileName: '',
      canvasOriginalFileSize: undefined,
    });
  }, [data, fileName, nodeId, updateNodeData]);

  useEffect(() => {
    let cancelled = false;
    if (mediaKind !== 'image' || !maskSource) {
      setMaskContentState('empty');
      return;
    }

    void detectMaskHasPaint(maskSource)
      .then((hasPaint) => {
        if (!cancelled) setMaskContentState(hasPaint ? 'present' : 'empty');
      })
      .catch(() => {
        if (!cancelled) setMaskContentState('empty');
      });

    return () => {
      cancelled = true;
    };
  }, [maskSource, mediaKind]);

  const statusText = uploadError
    ? '上传失败'
    : uploading
      ? '上传中'
      : fileUrl
        ? '已上传'
        : previewUrl
          ? '本地预览'
          : '未选择';

  return (
    <div className="node-content-shell node-content-shell--file" style={outerStyle}>
      <input ref={fileInputRef} type="file" accept={accept} onChange={handleFileChange} className="hidden" />
        {previewDisplayUrl ? (
          <>
          <MediaPreview value={previewUrl || previewDisplayUrl} previewValue={previewDisplayUrl} compact fill inertImage kindOverride={mediaKind} minHeightOverride={mediaKind === 'audio' ? 48 : 82} />
            <div className="node-file-status">
            <span className="node-file-status__name">{fileName}</span>
            <span className={uploadError ? 'node-file-status__state node-file-status__state--error' : uploading ? 'node-file-status__state node-file-status__state--loading' : 'node-file-status__state'}>
              {statusText}
            </span>
          </div>
          {mediaKind === 'image' && (
            <div className="node-file-badges">
              <span className={`node-file-badge${hasGeneratedMask ? ' node-file-badge--active' : ''}`}>
                {hasGeneratedMask ? '已附带遮罩' : '未生成遮罩'}
              </span>
              {hasOriginalCanvasImage && (
                <button
                  type="button"
                  className="node-file-badge node-file-badge--button"
                  onClick={(event) => {
                    event.stopPropagation();
                    restoreOriginalCanvasImage();
                  }}
                >
                  恢复原图
                </button>
              )}
              {(maskUploading || maskUploadError) && (
                <span className={`node-file-badge${maskUploadError ? ' node-file-badge--error' : ''}`}>
                  {maskUploadError ? '遮罩上传失败' : '遮罩上传中'}
                </span>
              )}
            </div>
          )}
          {uploadError && <div className="node-file-error">{uploadError}</div>}
        </>
      ) : !uploading ? (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className={`node-file-drop node-file-drop--${mediaKind}`}
        >
          {placeholder}
        </button>
      ) : null}
      <div className="node-file-path-row">
        <input
          type="text"
          value={localPathField.value}
          onChange={(event) => localPathField.onChange(event.target.value)}
          onFocus={() => localPathField.onFocus()}
          onBlur={(event) => localPathField.onBlur(event.target.value)}
          onCompositionStart={() => localPathField.onCompositionStart()}
          onCompositionEnd={(event) => localPathField.onCompositionEnd(event.currentTarget.value)}
          placeholder={label + '本地路径'}
          className="nodrag node-file-path-input"
          onClick={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        />
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            fileInputRef.current?.click();
          }}
          className="nodrag node-secondary-button"
        >
          选取
        </button>
      </div>
    </div>
  );
}

function MaskInputContent({
  data,
  nodeId,
  updateNodeData,
  outerStyle,
}: {
  data: Record<string, unknown>;
  nodeId: string;
  updateNodeData: (nodeId: string, data: Record<string, unknown>) => void;
  outerStyle: CSSProperties;
}) {
  const fileUrl = (data.fileUrl as string) || '';
  const storedPreviewUrl = (data.previewUrl as string) || '';
  const fileName = (data.fileName as string) || '';
  const localPath = (data.localPath as string) || '';
  const uploading = Boolean(data._uploading);
  const uploadError = (data._uploadError as string) || '';
  const previewUrl = storedPreviewUrl && !(storedPreviewUrl.startsWith('blob:') && fileUrl) ? storedPreviewUrl : fileUrl;
  const threshold = Number(data.threshold ?? 128);
  const invertMask = Boolean(data.invertMask);
  const [maskPreviewUrl, setMaskPreviewUrl] = useState('');
  const [previewState, setPreviewState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatUploadError = useCallback((message?: string | null) => {
    const detail = String(message || '').trim();
    return detail
      ? `上传没有完成，请检查文件格式、大小或稍后重试。${detail}`
      : '上传没有完成，请检查文件格式、大小或稍后重试。';
  }, []);

  const uploadSelectedFile = useCallback(async (file: File) => {
    if (!file) return;

    const localPreview = URL.createObjectURL(file);
    updateNodeData(nodeId, {
      fileUrl: '',
      thumbnailUrl: '',
      previewUrl: localPreview,
      localPath: file.webkitRelativePath || file.name,
      fileName: file.name,
      fileKind: 'image',
      fileSize: file.size,
      _uploading: true,
      _uploadError: '',
    });

    try {
      const result = await uploadFile(file);
      if (result.success && result.url) {
        URL.revokeObjectURL(localPreview);
        updateNodeData(nodeId, {
          fileUrl: result.url,
          thumbnailUrl: result.thumbnailUrl || '',
          previewUrl: result.url,
          fileName: result.fileName || file.name,
          fileSize: result.fileSize || file.size,
          _uploading: false,
          _uploadError: '',
        });
      } else {
        URL.revokeObjectURL(localPreview);
        updateNodeData(nodeId, { previewUrl: '', _uploading: false, _uploadError: formatUploadError(result.error) });
      }
    } catch (error) {
      URL.revokeObjectURL(localPreview);
      updateNodeData(nodeId, { previewUrl: '', _uploading: false, _uploadError: formatUploadError(error instanceof Error ? error.message : '') });
    }
  }, [formatUploadError, nodeId, updateNodeData]);

  const handleFileChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) await uploadSelectedFile(file);
    event.target.value = '';
  }, [uploadSelectedFile]);

  const handlePathChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const nextPath = event.target.value;
    if (!nextPath) {
      updateNodeData(nodeId, {
        localPath: '',
        fileUrl: '',
        previewUrl: '',
        fileName: '',
        fileSize: undefined,
        _uploading: false,
        _uploadError: '',
      });
      return;
    }

    updateNodeData(nodeId, { localPath: nextPath });
  }, [nodeId, updateNodeData]);

  useEffect(() => {
    let revokedUrl = '';
    let cancelled = false;

    async function buildMaskPreview() {
      if (!previewUrl) {
        setMaskPreviewUrl('');
        setPreviewState('idle');
        return;
      }

      setPreviewState('loading');

      try {
        const image = await loadImage(previewUrl);
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth || image.width;
        canvas.height = image.naturalHeight || image.height;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) throw new Error('无法创建遮罩预览画布');

        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        const pixels = imageData.data;

        for (let index = 0; index < pixels.length; index += 4) {
          const r = pixels[index];
          const g = pixels[index + 1];
          const b = pixels[index + 2];
          const alpha = pixels[index + 3];
          const sourceValue = alpha < 255
            ? alpha
            : Math.round(0.299 * r + 0.587 * g + 0.114 * b);
          const whitePixel = sourceValue >= threshold;
          const shouldEdit = invertMask ? !whitePixel : whitePixel;
          const previewAlpha = shouldEdit ? 0 : 255;
          pixels[index] = 0;
          pixels[index + 1] = 0;
          pixels[index + 2] = 0;
          pixels[index + 3] = previewAlpha;
        }

        context.putImageData(imageData, 0, 0);
        const blob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob((nextBlob) => {
            if (nextBlob) resolve(nextBlob);
            else reject(new Error('无法生成遮罩预览'));
          }, 'image/png');
        });

        if (cancelled) return;
        revokedUrl = URL.createObjectURL(blob);
        setMaskPreviewUrl(revokedUrl);
        setPreviewState('ready');
      } catch {
        if (cancelled) return;
        setMaskPreviewUrl('');
        setPreviewState('error');
      }
    }

    void buildMaskPreview();

    return () => {
      cancelled = true;
      if (revokedUrl) URL.revokeObjectURL(revokedUrl);
    };
  }, [invertMask, previewUrl, threshold]);

  return (
    <div className="node-content-shell node-content-shell--file" style={outerStyle}>
      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
      {previewUrl ? (
        <>
          {maskPreviewUrl ? (
            <MediaPreview value={maskPreviewUrl} compact fill inertImage kindOverride="image" minHeightOverride={82} />
          ) : (
            <div
              className="mx-0.5 rounded-xl px-2.5 py-3 text-[10px]"
              style={{
                background: 'var(--color-bg-tertiary)',
                color: previewState === 'error' ? 'var(--color-danger)' : 'var(--color-text-tertiary)',
                border: '1px solid var(--color-border)',
                minHeight: 82,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {previewState === 'loading' ? '正在生成遮罩预览...' : '遮罩预览暂时不可用，请调整源图或稍后重试。'}
            </div>
          )}
          <div className="node-file-status">
            <span className="node-file-status__name">{fileName}</span>
            <span className={uploadError ? 'node-file-status__state node-file-status__state--error' : uploading ? 'node-file-status__state node-file-status__state--loading' : 'node-file-status__state'}>
              {uploadError ? '上传失败' : uploading ? '上传中' : fileUrl ? '已上传' : '本地预览'}
            </span>
          </div>
          {uploadError && <div className="node-file-error">{uploadError}</div>}
        </>
      ) : !uploading ? (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="node-file-drop node-file-drop--image"
        >
          选择遮罩源图...
        </button>
      ) : null}
      <div className="px-2 pb-1 text-[10px] leading-4" style={{ color: 'var(--color-text-tertiary)' }}>
        Alpha 优先，否则按灰度取样并按阈值转黑白；白色默认作为编辑区，可用反相切换。
      </div>
      <div className="node-file-path-row">
        <input
          type="text"
          value={localPath}
          onChange={handlePathChange}
          placeholder="遮罩源图本地路径"
          className="nodrag node-file-path-input"
          onClick={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
        />
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            fileInputRef.current?.click();
          }}
          className="nodrag node-secondary-button"
        >
          选取
        </button>
      </div>
    </div>
  );
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('图片加载失败'));
    image.src = src;
  });
}

async function detectMaskHasPaint(src: string) {
  const image = await loadImage(src);
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return false;
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index + 3] === 0) continue;
    if (pixels[index] > 8 || pixels[index + 1] > 8 || pixels[index + 2] > 8) return true;
  }
  return false;
}

function MergeContent({
  connectedCount,
  maxInputs,
  outerStyle,
  note,
}: {
  connectedCount: number;
  maxInputs: number;
  outerStyle: CSSProperties;
  note?: string;
}) {
  return (
    <div
      className="node-content-shell node-merge-content"
      style={{
        ...outerStyle,
        overflow: 'visible',
      }}
    >
      <span className="node-merge-count">
        已连接 {connectedCount} / {maxInputs}
      </span>
      <span className="node-merge-note">
        {note || '按端口顺序合并为一组'}
      </span>
    </div>
  );
}

function ApiKeyContent({
  data,
  nodeId,
  updateNodeData,
  outerStyle,
}: {
  data: Record<string, unknown>;
  nodeId: string;
  updateNodeData: (nodeId: string, data: Record<string, unknown>) => void;
  outerStyle: CSSProperties;
}) {
  const apiKey = String(data.apiKey || '');
  const baseUrl = String(data.baseUrl || '');
  const selectedModel = String(data.selectedModel || '');
  const legacyEndpoint = String(data.endpoint || '');
  const endpointMode = data.endpointMode === 'custom' || (!data.endpointMode && legacyEndpoint) ? 'custom' : 'category';
  const endpointCategory = String(data.endpointCategory || 'chat');
  const customEndpoint = String(data.customEndpoint || legacyEndpoint);
  const modelOptions = Array.isArray(data.apiModels) ? data.apiModels.map(String) : [];
  const modelsLoading = Boolean(data._modelsLoading);
  const modelsError = String(data._modelsError || '');
  const modelsUpdatedAt = Number(data._modelsUpdatedAt || 0);

  const update = useCallback((patch: Record<string, unknown>) => {
    updateNodeData(nodeId, patch);
  }, [nodeId, updateNodeData]);

  const clearDetectedModels = useCallback((patch: Record<string, unknown>) => {
    update({
      ...patch,
      apiModels: [],
      apiModelGroups: undefined,
      _modelsError: '',
      _modelsUpdatedAt: 0,
    });
  }, [update]);

  const detectModels = useCallback(async () => {
    if (!apiKey.trim()) {
      update({ _modelsLoading: false, _modelsError: '请先填写当前节点的 API Key，再检测可用模型。' });
      return;
    }

    update({ _modelsLoading: true, _modelsError: '' });
    const result = await testApiConnection(apiKey.trim(), baseUrl, NODE_API_PROVIDER_CONFIG);
    if (!result.success || !result.data) {
      update({ _modelsLoading: false, _modelsError: formatModelDetectError(result.error) });
      return;
    }

    const models = result.data.models || [];
    update({
      apiModels: models,
      apiModelGroups: result.data.categorized || { chat: [], image: [], video: [] },
      selectedModel: models.includes(selectedModel) ? selectedModel : (models[0] || selectedModel),
      _modelsLoading: false,
      _modelsError: '',
      _modelsUpdatedAt: Date.now(),
    });
  }, [apiKey, baseUrl, selectedModel, update]);

  return (
    <div
      className="nodrag node-content-shell node-api-content"
      style={{ ...outerStyle, overflow: 'auto' }}
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <ApiKeyField
        label="API Key"
        value={apiKey}
        type="password"
        placeholder="sk-..."
        onChange={(value) => clearDetectedModels({ apiKey: value })}
      />
      <ApiKeyField
        label="Base URL"
        value={baseUrl}
        placeholder="https://api.example.com/v1"
        onChange={(value) => clearDetectedModels({ baseUrl: value })}
      />
      <div className="node-api-section">
        <div className="node-api-section__header">
          <label className="node-api-label">
            模型列表
          </label>
          <button
            type="button"
            onClick={detectModels}
            disabled={modelsLoading}
            className={`node-detect-button${modelsLoading ? ' node-detect-button--loading' : ''}`}
          >
            {modelsLoading ? '检测中...' : '检测模型'}
          </button>
        </div>
        <select
          value={modelOptions.includes(selectedModel) ? selectedModel : ''}
          onChange={(event) => update({ selectedModel: event.target.value })}
          className="node-api-input node-api-input--spaced"
        >
          <option value="">{modelOptions.length ? '从本节点检测结果中选择...' : '请先检测模型，或手动输入'}</option>
          {modelOptions.map((model) => (
            <option key={model} value={model}>{model}</option>
          ))}
        </select>
        <input
          type="text"
          value={selectedModel}
          onChange={(event) => update({ selectedModel: event.target.value })}
          placeholder="或手动输入模型 ID"
          className="node-api-input"
        />
        <div className={modelsError ? 'node-api-hint node-api-hint--error' : 'node-api-hint'}>
          {modelsError || (modelsUpdatedAt
            ? ('已检测 ' + String(modelOptions.length) + ' 个模型')
            : '模型列表只来自当前 API Key 节点的检测结果，不依赖项目模型库')}
        </div>
      </div>
      <ApiKeyField
        label="接口模式"
        value={endpointMode}
        kind="select"
        options={[
          { label: '内置接口类型', value: 'category' },
          { label: '自定义路径', value: 'custom' },
        ]}
        onChange={(value) => update({ endpointMode: value })}
      />
      {endpointMode === 'category' ? (
        <ApiKeyField
          label="接口类型"
          value={endpointCategory}
          kind="select"
          options={[
            { label: '对话接口 /v1/chat/completions', value: 'chat' },
            { label: '图像生成 /v1/images/generations', value: 'image' },
            { label: '图像编辑 /v1/images/edits', value: 'image-edit' },
            { label: 'Gemini generateContent', value: 'gemini-generate-content' },
            { label: '视频生成 /v1/video/generations', value: 'video' },
          ]}
          onChange={(value) => update({ endpointCategory: value })}
        />
      ) : (
        <ApiKeyField
          label="自定义路径"
          value={customEndpoint}
          placeholder="/v1/chat/completions"
          onChange={(value) => update({ customEndpoint: value, endpoint: value })}
        />
      )}
      <div className="node-api-note">
        只会影响与这个 API Key 节点直接相连的 AI 节点。接口模式可选择内置类型或自定义路径；缺少任意必填项都会直接中断执行。
      </div>
    </div>
  );
}

function ApiKeyField({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  kind = 'input',
  options = [],
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: 'text' | 'password';
  kind?: 'input' | 'select';
  options?: { label: string; value: string }[];
}) {
  const field = useBufferedStringField(value, onChange);

  return (
    <div className="node-api-section">
      <label className="node-api-label">
        {label}
      </label>
      {kind === 'select' ? (
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="node-api-input"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      ) : (
        <input
          type={type}
          value={field.value}
          placeholder={placeholder}
          onChange={(event) => field.onChange(event.target.value)}
          onFocus={() => field.onFocus()}
          onBlur={(event) => field.onBlur(event.target.value)}
          onCompositionStart={() => field.onCompositionStart()}
          onCompositionEnd={(event) => field.onCompositionEnd(event.currentTarget.value)}
          className="node-api-input"
          onKeyDown={(event) => event.stopPropagation()}
        />
      )}
    </div>
  );
}

function NodeSettingsContent({
  params,
  nodeType,
  nodeId,
  data,
  outerStyle,
  onChange,
  onPatch,
}: {
  params: NonNullable<NodeDef>['params'];
  nodeType: string;
  nodeId?: string;
  data: Record<string, unknown>;
  outerStyle: CSSProperties;
  onChange: (paramId: string, value: unknown) => void;
  onPatch: (patch: Record<string, unknown>) => void;
}) {
  return (
    <div className="node-content-shell node-settings-content" style={{ ...outerStyle, overflow: 'auto' }}>
      <div className="node-settings-content__inner">
        <NodeParamFields params={params} nodeType={nodeType} nodeId={nodeId} values={data} onChange={onChange} onPatch={onPatch} />
      </div>
    </div>
  );
}

function TextResultPreviewContent({
  params,
  nodeType,
  nodeId,
  data,
  outputs,
  outerStyle,
  onChange,
  onPatch,
  mode,
}: {
  params: NonNullable<NodeDef>['params'];
  nodeType: string;
  nodeId?: string;
  data: Record<string, unknown>;
  outputs?: Record<string, unknown>;
  outerStyle: CSSProperties;
  onChange: (paramId: string, value: unknown) => void;
  onPatch: (patch: Record<string, unknown>) => void;
  mode: 'clean' | 'split';
}) {
  const [fullscreenValue, setFullscreenValue] = useState<{ title: string; value: string; segments?: string[] } | null>(null);
  const cleanPreview = mode === 'clean' ? buildTextCleanPreview(data, outputs) : '';
  const splitPreview = mode === 'split' ? buildTextSplitPreview(data, outputs) : [];
  const hasRuntimeOutput = Boolean(outputs && Object.keys(outputs).length > 0);
  return (
    <div className="node-content-shell node-settings-content node-settings-content--with-preview" style={{ ...outerStyle, overflow: 'auto' }}>
      <div className="node-settings-content__inner">
        <NodeParamFields params={params} nodeType={nodeType} nodeId={nodeId} values={data} onChange={onChange} onPatch={onPatch} />
        <div className="node-result-preview">
          <div className="node-result-preview__header">
            <span>{mode === 'clean' ? '清理后预览' : '拆分预览'}</span>
            <span>{hasRuntimeOutput ? '最近执行结果' : '本地预览'}</span>
          </div>
          {mode === 'clean' ? (
            <button
              type="button"
              className={['node-result-preview__text', cleanPreview ? '' : 'node-result-preview__text--empty'].filter(Boolean).join(' ')}
              onDoubleClick={() => cleanPreview && setFullscreenValue({ title: '查看清理后文本', value: cleanPreview })}
              title={cleanPreview ? '双击全屏查看' : undefined}
            >
              {cleanPreview || '暂无可预览内容，执行后会显示清理结果。'}
            </button>
          ) : (
            <button
              type="button"
              className="node-result-preview__open"
              onClick={() => setFullscreenValue({
                title: '查看拆分预览',
                value: splitPreview.some((item) => item.trim()) ? splitPreview.join('\n\n') : '暂无可预览内容。',
                segments: splitPreview,
              })}
            >
              拆分预览
            </button>
          )}
        </div>
      </div>
      {fullscreenValue && (
        <LongTextEditorModal
          title={fullscreenValue.title}
          value={fullscreenValue.value}
          segments={fullscreenValue.segments}
          placeholder=""
          onChange={() => undefined}
          onSegmentsChange={(nextSegments) => {
            setFullscreenValue((current) => (
              current
                ? {
                    ...current,
                    segments: nextSegments,
                    value: nextSegments.join('\n\n'),
                  }
                : current
            ));
            onPatch({ segments: nextSegments });
          }}
          onClose={() => setFullscreenValue(null)}
        />
      )}
    </div>
  );
}

function OutputContent({
  outputs,
  outerStyle,
  isLastSection,
}: {
  outputs?: Record<string, unknown>;
  outerStyle: CSSProperties;
  isLastSection: boolean;
}) {
  const content = outputs?.content;
  void isLastSection;

  if (content === undefined || content === null) {
    return (
      <div className="node-content-shell node-output-content node-output-content--empty" style={outerStyle}>
        <span>等待输入内容...</span>
      </div>
    );
  }

  return (
    <div className="node-content-shell node-output-content" style={{ ...outerStyle, overflow: 'hidden' }}>
      <InteractiveValue value={content} />
    </div>
  );
}

function ImageCompareContent({
  outputs,
  outerStyle,
}: {
  outputs?: Record<string, unknown>;
  outerStyle: CSSProperties;
}) {
  const [position, setPosition] = useState(50);
  const image1 = typeof outputs?.image1 === 'string' ? outputs.image1 : '';
  const image2 = typeof outputs?.image2 === 'string' ? outputs.image2 : '';
  const ready = Boolean(image1 && image2);

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const nextPosition = ((event.clientX - rect.left) / rect.width) * 100;
    setPosition(Math.min(100, Math.max(0, nextPosition)));
  };

  if (!ready) {
    return (
      <div className="node-content-shell node-image-compare node-image-compare--empty" style={outerStyle}>
        <span>运行后展示两张图片的对比预览</span>
      </div>
    );
  }

  return (
    <div className="node-content-shell node-image-compare" style={outerStyle}>
      <div
        className="node-image-compare__viewport nodrag"
        onPointerMove={handlePointerMove}
        onPointerLeave={() => setPosition(50)}
        style={{ '--compare-position': `${position}%` } as CSSProperties}
      >
        <div className="node-image-compare__pane node-image-compare__pane--left">
          <img className="node-image-compare__image" src={image1} alt="图片1" draggable={false} />
        </div>
        <div className="node-image-compare__pane node-image-compare__pane--right">
          <img className="node-image-compare__image" src={image2} alt="图片2" draggable={false} />
        </div>
        <div className="node-image-compare__divider" aria-hidden="true" />
        <div className="node-image-compare__labels" aria-hidden="true">
          <span>图片1</span>
          <span>图片2</span>
        </div>
      </div>
    </div>
  );
}

function InteractiveValue({ value }: { value: unknown }) {
  if (typeof value === 'string') {
    if (isRenderableOutputMediaUrl(value)) return <MediaCard value={value} fill />;
    return <TextCard text={value} />;
  }

  if (isRenderableOutputMediaObject(value)) {
    if (value.type === 'image' && isRenderableOutputMediaUrl(value.url)) {
      return <MediaPreview value={value.url} previewValue={value.thumbnailUrl || value.url} fill inertImage kindOverride="image" />;
    }
    if (isRenderableOutputMediaUrl(value.url)) {
      return <MediaCard value={value.url} fill />;
    }
  }

  if (Array.isArray(value)) {
    const mediaValues = value.filter((item): item is string => typeof item === 'string' && isRenderableOutputMediaUrl(item));
    if (mediaValues.length === value.length && mediaValues.length > 0) {
      if (mediaValues.length === 1) return <MediaCard value={mediaValues[0]} fill />;

      return (
        <div className="node-media-grid">
          {mediaValues.map((item, index) => (
            <MediaCard key={String(index)} value={item} compact fill />
          ))}
        </div>
      );
    }
    return <TextCard text={JSON.stringify(value, null, 2)} mono />;
  }

  return <TextCard text={JSON.stringify(value, null, 2)} mono />;
}

function isRenderableOutputMediaUrl(value: string) {
  if (value.startsWith('data:') || value.startsWith('blob:')) return isMediaUrl(value);
  if (value.startsWith('/api/files/') || value.startsWith('/api/outputs/')) return isMediaUrl(value);
  return false;
}

function isRenderableOutputMediaObject(value: unknown): value is { url: string; thumbnailUrl?: string; type?: string } {
  return Boolean(value && typeof value === 'object' && typeof (value as { url?: unknown }).url === 'string');
}
