import { uploadFile } from '@/domains/workflow/lib/api';
import { waitForUploadedImageMetadata } from '@/domains/workflow/lib/uploadProcessing';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { MediaPreview, inferImageThumbnailUrl } from './NodeMedia';
import { getUploadProcessingState, getUploadStatusClassName, getUploadStatusText } from './nodeContentShared';
import { useBufferedStringField } from './useBufferedStringField';

export function FileInputContent({
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
  const previewUrl =
    storedPreviewUrl && !(storedPreviewUrl.startsWith('blob:') && fileUrl) ? storedPreviewUrl : fileUrl;
  const fileName = (data.fileName as string) || '';
  const localPath = (data.localPath as string) || '';
  const imageWidth = typeof data.width === 'number' ? data.width : undefined;
  const imageHeight = typeof data.height === 'number' ? data.height : undefined;
  const uploading = Boolean(data._uploading);
  const uploadError = (data._uploadError as string) || '';
  const { processingStatus, processingError } = getUploadProcessingState(data);
  const maskFileUrl = (data.maskFileUrl as string) || '';
  const maskPreviewUrl = (data.maskPreviewUrl as string) || '';
  const maskUploadError = (data._maskUploadError as string) || '';
  const maskUploading = Boolean(data._maskUploading);
  const mediaKind = accept.startsWith('image') ? 'image' : accept.startsWith('video') ? 'video' : 'audio';
  const previewDisplayUrl =
    mediaKind === 'image' ? thumbnailUrl || inferImageThumbnailUrl(fileUrl || previewUrl) || previewUrl : previewUrl;
  const maskSource =
    maskPreviewUrl && !(maskPreviewUrl.startsWith('blob:') && maskFileUrl) ? maskPreviewUrl : maskFileUrl;
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
        width: undefined,
        height: undefined,
        _uploading: false,
        _uploadError: '',
        _fileProcessingStatus: '',
        _fileProcessingError: '',
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

  const uploadSelectedFile = useCallback(
    async (file: File) => {
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
        width: undefined,
        height: undefined,
        _uploading: true,
        _uploadError: '',
        _fileProcessingStatus: '',
        _fileProcessingError: '',
        canvasOriginalFileUrl: '',
        canvasOriginalPreviewUrl: '',
        canvasOriginalFileName: '',
        canvasOriginalFileSize: undefined,
      });

      try {
        const result = await uploadFile(file);
        if (result.success && result.url) {
          updateNodeData(nodeId, {
            fileUrl: result.url,
            thumbnailUrl: result.thumbnailUrl || '',
            previewUrl: result.thumbnailUrl || localPreview,
            fileName: result.fileName || file.name,
            fileSize: result.fileSize || file.size,
            width: result.width,
            height: result.height,
            _uploading: false,
            _uploadError: '',
            _fileProcessingStatus: result.processing ? 'processing' : result.processingStatus || '',
            _fileProcessingError: result.processingError || '',
          });
          if (result.processing && result.url) {
            void waitForUploadedImageMetadata(result.url, (metadata) => {
              if (metadata.thumbnailUrl || metadata.url) {
                URL.revokeObjectURL(localPreview);
              }
              updateNodeData(nodeId, {
                fileUrl: metadata.url || result.url,
                thumbnailUrl: metadata.thumbnailUrl || '',
                previewUrl: metadata.thumbnailUrl || metadata.url || result.url,
                width: metadata.width,
                height: metadata.height,
                _fileProcessingStatus: metadata.processingStatus || '',
                _fileProcessingError: metadata.processingError || '',
              });
            });
          } else if (result.thumbnailUrl || result.url) {
            URL.revokeObjectURL(localPreview);
          }
        } else {
          URL.revokeObjectURL(localPreview);
          updateNodeData(nodeId, {
            previewUrl: '',
            _uploading: false,
            _uploadError: formatUploadError(result.error),
            _fileProcessingStatus: '',
            _fileProcessingError: '',
          });
        }
      } catch (error) {
        URL.revokeObjectURL(localPreview);
        updateNodeData(nodeId, {
          previewUrl: '',
          _uploading: false,
          _uploadError: formatUploadError(error instanceof Error ? error.message : ''),
          _fileProcessingStatus: '',
          _fileProcessingError: '',
        });
      }
    },
    [formatUploadError, mediaKind, nodeId, updateNodeData],
  );

  const handleFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) await uploadSelectedFile(file);
      event.target.value = '';
    },
    [uploadSelectedFile],
  );

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
      _fileProcessingStatus: '',
      _fileProcessingError: '',
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

  const statusText = getUploadStatusText({
    uploadError,
    uploading,
    fileUrl,
    previewUrl,
    processingStatus,
    processingError,
  });
  const statusClassName = getUploadStatusClassName({
    uploadError,
    uploading,
    processingStatus,
    processingError,
  });

  return (
    <div className="node-content-shell node-content-shell--file" style={outerStyle}>
      <input ref={fileInputRef} type="file" accept={accept} onChange={handleFileChange} className="hidden" />
      {previewDisplayUrl ? (
        <>
          <MediaPreview
            value={previewUrl || previewDisplayUrl}
            previewValue={previewDisplayUrl}
            imageWidth={imageWidth}
            imageHeight={imageHeight}
            compact
            fill
            inertImage
            kindOverride={mediaKind}
            minHeightOverride={mediaKind === 'audio' ? 48 : 82}
          />
          <div className="node-file-status">
            <span className="node-file-status__name">{fileName}</span>
            <span className={statusClassName}>{statusText}</span>
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
          {(uploadError || processingError) && <div className="node-file-error">{uploadError || processingError}</div>}
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
          placeholder={`${label}本地路径`}
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

export function MaskInputContent({
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
  const { processingStatus, processingError } = getUploadProcessingState(data);
  const previewUrl =
    storedPreviewUrl && !(storedPreviewUrl.startsWith('blob:') && fileUrl) ? storedPreviewUrl : fileUrl;
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

  const uploadSelectedFile = useCallback(
    async (file: File) => {
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
        _fileProcessingStatus: '',
        _fileProcessingError: '',
      });

      try {
        const result = await uploadFile(file);
        if (result.success && result.url) {
          updateNodeData(nodeId, {
            fileUrl: result.url,
            thumbnailUrl: result.thumbnailUrl || '',
            previewUrl: result.thumbnailUrl || localPreview,
            fileName: result.fileName || file.name,
            fileSize: result.fileSize || file.size,
            _uploading: false,
            _uploadError: '',
            _fileProcessingStatus: result.processing ? 'processing' : result.processingStatus || '',
            _fileProcessingError: result.processingError || '',
          });
          if (result.processing && result.url) {
            void waitForUploadedImageMetadata(result.url, (metadata) => {
              if (metadata.thumbnailUrl || metadata.url) {
                URL.revokeObjectURL(localPreview);
              }
              updateNodeData(nodeId, {
                fileUrl: metadata.url || result.url,
                thumbnailUrl: metadata.thumbnailUrl || '',
                previewUrl: metadata.thumbnailUrl || metadata.url || result.url,
                width: metadata.width,
                height: metadata.height,
                _fileProcessingStatus: metadata.processingStatus || '',
                _fileProcessingError: metadata.processingError || '',
              });
            });
          } else if (result.thumbnailUrl || result.url) {
            URL.revokeObjectURL(localPreview);
          }
        } else {
          URL.revokeObjectURL(localPreview);
          updateNodeData(nodeId, {
            previewUrl: '',
            _uploading: false,
            _uploadError: formatUploadError(result.error),
            _fileProcessingStatus: '',
            _fileProcessingError: '',
          });
        }
      } catch (error) {
        URL.revokeObjectURL(localPreview);
        updateNodeData(nodeId, {
          previewUrl: '',
          _uploading: false,
          _uploadError: formatUploadError(error instanceof Error ? error.message : ''),
          _fileProcessingStatus: '',
          _fileProcessingError: '',
        });
      }
    },
    [formatUploadError, nodeId, updateNodeData],
  );

  const handleFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) await uploadSelectedFile(file);
      event.target.value = '';
    },
    [uploadSelectedFile],
  );

  const handlePathChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
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
          _fileProcessingStatus: '',
          _fileProcessingError: '',
        });
        return;
      }

      updateNodeData(nodeId, { localPath: nextPath });
    },
    [nodeId, updateNodeData],
  );

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
          const sourceValue = alpha < 255 ? alpha : Math.round(0.299 * r + 0.587 * g + 0.114 * b);
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
            <span className={getUploadStatusClassName({ uploadError, uploading, processingStatus, processingError })}>
              {getUploadStatusText({ uploadError, uploading, fileUrl, previewUrl, processingStatus, processingError })}
            </span>
          </div>
          {(uploadError || processingError) && <div className="node-file-error">{uploadError || processingError}</div>}
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
