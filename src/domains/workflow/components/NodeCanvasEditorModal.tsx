import { Check, Eraser, Hand, Pencil, RotateCcw, RotateCw, Trash2, X } from 'lucide-react';
import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';

type ToolMode = 'brush' | 'eraser';
type ViewMode = 'draw' | 'pan';

interface NodeCanvasEditorModalProps {
  src: string;
  nodeLabel?: string;
  onClose: () => void;
  onSavePaint: (file: File, previewUrl: string) => Promise<void>;
}

type SnapshotHistory = {
  entries: string[];
  index: number;
};

const DEFAULT_BRUSH_SIZE = 26;
const MIN_ZOOM = 0.35;
const MAX_ZOOM = 4;

function formatCanvasEditorError(message?: string | null) {
  const detail = String(message || '').trim();
  return detail ? `保存没有完成，请稍后重试。${detail}` : '保存没有完成，请稍后重试。';
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('图片加载失败'));
    image.src = src;
  });
}

export function NodeCanvasEditorModal({
  src,
  nodeLabel = '画板',
  onClose,
  onSavePaint,
}: NodeCanvasEditorModalProps) {
  const [tool, setTool] = useState<ToolMode>('brush');
  const [brushSize, setBrushSize] = useState(DEFAULT_BRUSH_SIZE);
  const [paintColor, setPaintColor] = useState('#ff375f');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [loadedImage, setLoadedImage] = useState<HTMLImageElement | null>(null);
  const [history, setHistory] = useState<SnapshotHistory>({ entries: [], index: -1 });
  const [viewMode, setViewMode] = useState<ViewMode>('draw');
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [cursorPoint, setCursorPoint] = useState<{ x: number; y: number } | null>(null);
  const [showBrushSizePreview, setShowBrushSizePreview] = useState(false);

  const dirtyRef = useRef(false);
  const panPointerIdRef = useRef<number | null>(null);
  const panStartRef = useRef<{ x: number; y: number; originX: number; originY: number } | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const paintCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewUrlRef = useRef<string>('');
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const brushPreviewTimerRef = useRef<number | null>(null);

  const brushCursorColor = tool === 'eraser' ? '#ffffff' : paintColor;

  const imageDimensions = useMemo(() => {
    if (!loadedImage) return null;
    return {
      width: loadedImage.naturalWidth || loadedImage.width,
      height: loadedImage.naturalHeight || loadedImage.height,
    };
  }, [loadedImage]);

  const clampZoom = useCallback((value: number) => {
    return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
  }, []);

  const getFitZoom = useCallback(() => {
    if (!imageDimensions) return 1;
    const { width, height } = imageDimensions;
    const nextWidth = Math.max(viewportSize.width - 24, 1);
    const nextHeight = Math.max(viewportSize.height - 24, 1);
    return clampZoom(Math.min(nextWidth / width, nextHeight / height));
  }, [clampZoom, imageDimensions, viewportSize.height, viewportSize.width]);

  const resetViewport = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const fitViewport = useCallback(() => {
    setZoom(getFitZoom());
    setPan({ x: 0, y: 0 });
  }, [getFitZoom]);

  const handleClose = useCallback(() => {
    if (dirtyRef.current && !window.confirm('当前画板还有未保存修改，确定要关闭吗？')) return;
    onClose();
  }, [onClose]);

  useEffect(() => {
    dirtyRef.current = isDirty;
  }, [isDirty]);

  useEffect(() => {
    return () => {
      if (brushPreviewTimerRef.current !== null) window.clearTimeout(brushPreviewTimerRef.current);
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return undefined;

    const updateViewportSize = () => {
      setViewportSize({
        width: viewport.clientWidth,
        height: viewport.clientHeight,
      });
    };

    updateViewportSize();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateViewportSize) : null;
    observer?.observe(viewport);
    window.addEventListener('resize', updateViewportSize);

    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', updateViewportSize);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    void loadImage(src)
      .then((image) => {
        if (cancelled) return;
        setLoadedImage(image);
        setError('');
      })
      .catch(() => {
        if (cancelled) return;
        setLoadedImage(null);
        setError('源图加载失败，暂时不能进入画板。请检查图片链接或重新上传后再试。');
      });

    return () => {
      cancelled = true;
    };
  }, [src]);

  useEffect(() => {
    if (!loadedImage) return;

    const width = loadedImage.naturalWidth || loadedImage.width;
    const height = loadedImage.naturalHeight || loadedImage.height;
    const canvas = paintCanvasRef.current;
    if (!canvas) return;

    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) {
      setError('画板没有准备好，请关闭后重新打开再试。');
      return;
    }

    context.clearRect(0, 0, width, height);
    context.drawImage(loadedImage, 0, 0, width, height);
    setHistory({ entries: [canvas.toDataURL('image/png')], index: 0 });
    setIsDirty(false);
    fitViewport();
  }, [fitViewport, loadedImage]);

  useEffect(() => {
    const snapshot = history.entries[history.index];
    const canvas = paintCanvasRef.current;
    if (!canvas || !snapshot) return;
    const context = canvas.getContext('2d');
    if (!context) return;

    const image = new Image();
    image.onload = () => {
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
    };
    image.src = snapshot;
  }, [history.entries, history.index]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName;
      if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT' || target?.isContentEditable) return;

      if (event.key === 'Escape') {
        handleClose();
        return;
      }

      const isModifierPressed = event.ctrlKey || event.metaKey;
      if (!isModifierPressed) return;

      if (event.key.toLowerCase() === 'z' && !event.shiftKey) {
        event.preventDefault();
        setHistory((current) =>
          current.index <= 0 ? current : { ...current, index: current.index - 1 },
        );
        return;
      }

      if ((event.key.toLowerCase() === 'z' && event.shiftKey) || event.key.toLowerCase() === 'y') {
        event.preventDefault();
        setHistory((current) =>
          current.index >= current.entries.length - 1 ? current : { ...current, index: current.index + 1 },
        );
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleClose]);

  const showBrushPreviewTemporarily = useCallback(() => {
    setShowBrushSizePreview(true);
    if (brushPreviewTimerRef.current !== null) window.clearTimeout(brushPreviewTimerRef.current);
    brushPreviewTimerRef.current = window.setTimeout(() => {
      brushPreviewTimerRef.current = null;
      setShowBrushSizePreview(false);
    }, 700);
  }, []);

  const pushSnapshot = useCallback(() => {
    const canvas = paintCanvasRef.current;
    if (!canvas) return;
    const snapshot = canvas.toDataURL('image/png');
    setHistory((current) => {
      const nextEntries = current.entries.slice(0, current.index + 1);
      nextEntries.push(snapshot);
      const trimmedEntries = nextEntries.slice(-30);
      return { entries: trimmedEntries, index: trimmedEntries.length - 1 };
    });
  }, []);

  const beginPan = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      panPointerIdRef.current = event.pointerId;
      panStartRef.current = {
        x: event.clientX,
        y: event.clientY,
        originX: pan.x,
        originY: pan.y,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [pan.x, pan.y],
  );

  const updatePan = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (panPointerIdRef.current !== event.pointerId || !panStartRef.current) return;
    setPan({
      x: panStartRef.current.originX + (event.clientX - panStartRef.current.x),
      y: panStartRef.current.originY + (event.clientY - panStartRef.current.y),
    });
  }, []);

  const endPan = useCallback((event?: ReactPointerEvent<HTMLCanvasElement>) => {
    if (event && panPointerIdRef.current === event.pointerId) {
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // Ignore capture release failures.
      }
    }
    panPointerIdRef.current = null;
    panStartRef.current = null;
  }, []);

  const canvasStyle = useMemo(() => {
    if (!imageDimensions) return undefined;
    return {
      width: `${imageDimensions.width}px`,
      height: `${imageDimensions.height}px`,
      transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
      transformOrigin: 'center center',
    };
  }, [imageDimensions, pan.x, pan.y, zoom]);

  const drawSegment = useCallback(
    (from: { x: number; y: number }, to: { x: number; y: number }) => {
      const canvas = paintCanvasRef.current;
      if (!canvas) return;
      const context = canvas.getContext('2d');
      if (!context) return;

      context.lineCap = 'round';
      context.lineJoin = 'round';
      context.lineWidth = brushSize;
      context.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
      context.strokeStyle = paintColor;
      context.fillStyle = paintColor;

      context.beginPath();
      context.moveTo(from.x, from.y);
      context.lineTo(to.x, to.y);
      context.stroke();
      context.beginPath();
      context.arc(to.x, to.y, brushSize / 2, 0, Math.PI * 2);
      context.fill();
    },
    [brushSize, paintColor, tool],
  );

  const getPointerPosition = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = paintCanvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  }, []);

  const handleViewportWheel = useCallback(
    (event: ReactWheelEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (!imageDimensions) return;
      const canvas = paintCanvasRef.current;
      if (!canvas) return;

      const direction = event.deltaY > 0 ? -0.12 : 0.12;
      const canvasRect = canvas.getBoundingClientRect();
      const renderedCenterX = canvasRect.left + canvasRect.width / 2;
      const renderedCenterY = canvasRect.top + canvasRect.height / 2;
      const pointerOffsetX = event.clientX - renderedCenterX;
      const pointerOffsetY = event.clientY - renderedCenterY;

      setZoom((current) => {
        const nextZoom = clampZoom(Number((current + direction).toFixed(3)));
        if (nextZoom === current) return current;
        const zoomRatio = nextZoom / current;

        setPan((currentPan) => ({
          x: currentPan.x + pointerOffsetX - pointerOffsetX * zoomRatio,
          y: currentPan.y + pointerOffsetY - pointerOffsetY * zoomRatio,
        }));

        return nextZoom;
      });
    },
    [clampZoom, imageDimensions],
  );

  const finishDrawing = useCallback(() => {
    if (!isDrawing) return;
    setIsDrawing(false);
    lastPointRef.current = null;
    pushSnapshot();
    setIsDirty(true);
  }, [isDrawing, pushSnapshot]);

  const clearCanvas = useCallback(() => {
    const canvas = paintCanvasRef.current;
    if (!canvas || !loadedImage) return;
    const context = canvas.getContext('2d');
    if (!context) return;

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(loadedImage, 0, 0, canvas.width, canvas.height);
    pushSnapshot();
    setIsDirty(true);
  }, [loadedImage, pushSnapshot]);

  const exportCanvasToFile = useCallback(async () => {
    const canvas = paintCanvasRef.current;
    if (!canvas) throw new Error('无法导出当前绘制结果，请稍后重试。');
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((nextBlob) => {
        if (nextBlob) resolve(nextBlob);
        else reject(new Error('无法生成图片文件'));
      }, 'image/png');
    });
    const previewUrl = URL.createObjectURL(blob);
    const file = new File([blob], 'painted-image.png', { type: 'image/png' });
    return { file, previewUrl };
  }, []);

  const save = useCallback(
    async (closeAfterSave: boolean) => {
      try {
        setIsSaving(true);
        setError('');
        const { file, previewUrl } = await exportCanvasToFile();
        if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = previewUrl;
        await onSavePaint(file, previewUrl);
        setIsDirty(false);
        dirtyRef.current = false;
        if (closeAfterSave) onClose();
      } catch (nextError) {
        setError(formatCanvasEditorError(nextError instanceof Error ? nextError.message : ''));
      } finally {
        setIsSaving(false);
      }
    },
    [exportCanvasToFile, onClose, onSavePaint],
  );

  const handleBrushSizeChange = useCallback(
    (nextSize: number) => {
      setBrushSize(nextSize);
      showBrushPreviewTemporarily();
    },
    [showBrushPreviewTemporarily],
  );

  const isCanvasEditorAvailable = Boolean(loadedImage);
  const hasSourceImage = Boolean(src);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="node-canvas-editor-modal" onClick={handleClose}>
      <div className="node-canvas-editor-modal__dialog glass" onClick={(event) => event.stopPropagation()}>
        <div className="node-canvas-editor-modal__header">
          <div className="workflow-toolbar__badge">
            <Pencil size={16} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="node-canvas-editor-modal__eyebrow">Canvas</div>
            <div className="node-canvas-editor-modal__title">{nodeLabel}</div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="node-canvas-editor-modal__icon-button"
            aria-label="关闭画板"
          >
            <X size={16} />
          </button>
        </div>

        <div className="node-canvas-editor-modal__toolbar">
          <div className="node-canvas-editor-modal__tool-group">
            <button type="button" className={tool === 'brush' ? 'is-active' : ''} onClick={() => setTool('brush')}>
              <Pencil size={14} /> 画笔
            </button>
            <button type="button" className={tool === 'eraser' ? 'is-active' : ''} onClick={() => setTool('eraser')}>
              <Eraser size={14} /> 橡皮
            </button>
            <button
              type="button"
              className={viewMode === 'pan' ? 'is-active' : ''}
              onClick={() => setViewMode((current) => (current === 'pan' ? 'draw' : 'pan'))}
            >
              <Hand size={14} /> 平移
            </button>
          </div>

          <div className="node-canvas-editor-modal__tool-group">
            <button
              type="button"
              onClick={() =>
                setHistory((current) =>
                  current.index <= 0 ? current : { ...current, index: current.index - 1 },
                )
              }
              disabled={history.index <= 0}
            >
              <RotateCcw size={14} /> 撤销
            </button>
            <button
              type="button"
              onClick={() =>
                setHistory((current) =>
                  current.index >= current.entries.length - 1 ? current : { ...current, index: current.index + 1 },
                )
              }
              disabled={history.index >= history.entries.length - 1}
            >
              <RotateCw size={14} /> 重做
            </button>
            <button type="button" onClick={clearCanvas}>
              <Trash2 size={14} /> 清空
            </button>
          </div>

          <label className="node-canvas-editor-modal__slider">
            <span>笔刷 {brushSize}px</span>
            <input
              type="range"
              min={4}
              max={96}
              step={2}
              value={brushSize}
              style={{ '--range-progress': `${((brushSize - 4) / 92) * 100}%` } as CSSProperties}
              onChange={(event) => handleBrushSizeChange(Number(event.target.value))}
            />
          </label>

          <label className="node-canvas-editor-modal__color-picker">
            <span>颜色</span>
            <span
              className="node-canvas-editor-modal__color-swatch"
              style={{ '--paint-color': paintColor } as CSSProperties}
            >
              <input type="color" value={paintColor} onChange={(event) => setPaintColor(event.target.value)} />
            </span>
          </label>

          <div className="node-canvas-editor-modal__tool-group">
            <button type="button" onClick={() => setZoom((current) => clampZoom(Number((current - 0.15).toFixed(3))))}>
              缩小
            </button>
            <button type="button" onClick={fitViewport}>
              适合视图
            </button>
            <button type="button" onClick={resetViewport}>
              重置视图
            </button>
            <button type="button" onClick={() => setZoom((current) => clampZoom(Number((current + 0.15).toFixed(3))))}>
              放大
            </button>
          </div>
        </div>

        <div className="node-canvas-editor-modal__note">画板会把笔触合成到当前大图预览中，保存后沿用大图窗口的回写链路。</div>

        <div ref={viewportRef} className="node-canvas-editor-modal__viewport" onWheel={handleViewportWheel}>
          {!hasSourceImage ? (
            <div className="node-canvas-editor-modal__loading">当前没有可编辑的图片。</div>
          ) : loadedImage ? (
            <div className="node-canvas-editor-modal__canvas-stack" style={canvasStyle}>
              {cursorPoint && viewMode === 'draw' && (
                <div
                  className="node-canvas-editor-modal__brush-cursor"
                  style={
                    {
                      left: `${(cursorPoint.x / (paintCanvasRef.current?.width || 1)) * 100}%`,
                      top: `${(cursorPoint.y / (paintCanvasRef.current?.height || 1)) * 100}%`,
                      width: brushSize,
                      height: brushSize,
                      '--brush-color': brushCursorColor,
                    } as CSSProperties
                  }
                />
              )}
              {showBrushSizePreview && viewMode === 'draw' && (
                <div
                  className="node-canvas-editor-modal__brush-cursor node-canvas-editor-modal__brush-cursor--preview"
                  style={
                    {
                      left: '50%',
                      top: '50%',
                      width: brushSize,
                      height: brushSize,
                      '--brush-color': brushCursorColor,
                    } as CSSProperties
                  }
                />
              )}
              <canvas
                ref={paintCanvasRef}
                className="node-canvas-editor-modal__canvas is-active"
                onPointerDown={(event) => {
                  const shouldPan = event.button === 1 || viewMode === 'pan';
                  if (shouldPan) {
                    event.preventDefault();
                    beginPan(event);
                    return;
                  }
                  if (event.button !== 0) return;
                  const point = getPointerPosition(event);
                  if (!point) return;
                  event.currentTarget.setPointerCapture(event.pointerId);
                  setIsDrawing(true);
                  lastPointRef.current = point;
                  setCursorPoint(point);
                  drawSegment(point, point);
                  setIsDirty(true);
                }}
                onPointerMove={(event) => {
                  if (panPointerIdRef.current === event.pointerId) {
                    updatePan(event);
                    return;
                  }
                  const point = getPointerPosition(event);
                  if (point) setCursorPoint(point);
                  if (!isDrawing) return;
                  const lastPoint = lastPointRef.current;
                  if (!point || !lastPoint) return;
                  drawSegment(lastPoint, point);
                  lastPointRef.current = point;
                }}
                onPointerEnter={(event) => {
                  const point = getPointerPosition(event);
                  if (point) setCursorPoint(point);
                }}
                onPointerUp={(event) => {
                  if (panPointerIdRef.current === event.pointerId) {
                    endPan(event);
                    return;
                  }
                  finishDrawing();
                }}
                onPointerLeave={(event) => {
                  setCursorPoint(null);
                  if (panPointerIdRef.current === event.pointerId) {
                    endPan(event);
                    return;
                  }
                  finishDrawing();
                }}
                onPointerCancel={(event) => {
                  if (panPointerIdRef.current === event.pointerId) {
                    endPan(event);
                    return;
                  }
                  finishDrawing();
                }}
              />
            </div>
          ) : (
            <div className="node-canvas-editor-modal__loading">正在加载源图...</div>
          )}
        </div>

        <div className="node-canvas-editor-modal__footer">
          <div className="node-canvas-editor-modal__status">{error || (isDirty ? '有未保存修改' : '当前内容已同步')}</div>
          <div className="node-canvas-editor-modal__actions">
            <button
              type="button"
              className="node-canvas-editor-modal__secondary"
              onClick={handleClose}
              disabled={isSaving}
            >
              取消
            </button>
            <button
              type="button"
              className="node-canvas-editor-modal__secondary"
              onClick={() => {
                void save(false);
              }}
              disabled={isSaving || !isCanvasEditorAvailable}
            >
              <Check size={14} /> 仅保存
            </button>
            <button
              type="button"
              className="node-canvas-editor-modal__primary"
              onClick={() => {
                void save(true);
              }}
              disabled={isSaving || !isCanvasEditorAvailable}
            >
              {isSaving ? '保存中...' : '保存图片'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
