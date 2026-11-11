import { useWorkflowConfirm } from '@/domains/workflow/components/WorkflowConfirmDialog';
import { loadWorkflowImage } from '@/domains/workflow/lib/browserImage';
import {
  ArrowClockwise,
  ArrowCounterClockwise,
  Check,
  Eraser,
  Hand,
  NotePencil,
  Trash,
  X,
} from '@phosphor-icons/react';
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

type BrushPoint = { x: number; y: number; radius: number };

function brushMidpoint(a: BrushPoint, b: BrushPoint): BrushPoint {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, radius: (a.radius + b.radius) / 2 };
}

interface NodeCanvasEditorModalProps {
  src?: string;
  nodeLabel?: string;
  onClose: () => void;
  onSavePaint: (file: File, previewUrl: string) => Promise<void>;
}

type CanvasDimensions = { width: number; height: number };
type CanvasSnapshot = CanvasDimensions & { src: string };

type SnapshotHistory = {
  entries: CanvasSnapshot[];
  index: number;
};

const SKETCH_DIMENSIONS = { width: 768, height: 768 };
const MIN_SKETCH_SIDE = 64;
const MAX_SKETCH_SIDE = 2048;
const SKETCH_RATIOS = [
  [1, 1],
  [4, 3],
  [3, 4],
  [3, 2],
  [2, 3],
  [16, 9],
  [9, 16],
] as const;
const DEFAULT_BRUSH_SIZE = 26;
const MIN_ZOOM = 0.35;
const MAX_ZOOM = 4;

function formatCanvasEditorError(message?: string | null) {
  const detail = String(message || '').trim();
  return detail ? `保存没有完成，请稍后重试。${detail}` : '保存没有完成，请稍后重试。';
}

export function NodeCanvasEditorModal({ src, nodeLabel = '画板', onClose, onSavePaint }: NodeCanvasEditorModalProps) {
  const confirm = useWorkflowConfirm();
  const isSketch = src === undefined;
  const [tool, setTool] = useState<ToolMode>('brush');
  const [brushSize, setBrushSize] = useState(DEFAULT_BRUSH_SIZE);
  const [paintColor, setPaintColor] = useState(isSketch ? '#222222' : '#ff375f');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
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
  const renderedSnapshotRef = useRef<CanvasSnapshot | null>(null);
  const previewUrlRef = useRef<string>('');
  const strokeRef = useRef<{ pointerId: number; last: BrushPoint; midpoint: BrushPoint } | null>(null);
  const brushPreviewTimerRef = useRef<number | null>(null);

  const brushCursorColor = tool === 'eraser' ? '#ffffff' : paintColor;

  const initialDimensions = useMemo(() => {
    if (isSketch) return SKETCH_DIMENSIONS;
    if (!loadedImage) return null;
    return {
      width: loadedImage.naturalWidth || loadedImage.width,
      height: loadedImage.naturalHeight || loadedImage.height,
    };
  }, [isSketch, loadedImage]);

  const snapshot = history.entries[history.index];
  const dimensions = isSketch && snapshot ? snapshot : initialDimensions;
  const width = dimensions?.width;
  const height = dimensions?.height;
  const imageDimensions = useMemo(() => (width && height ? { width, height } : null), [width, height]);

  const getFitZoom = useCallback(() => {
    if (!imageDimensions || !viewportSize.width || !viewportSize.height) return 1;
    const { width, height } = imageDimensions;
    const nextWidth = Math.max(viewportSize.width - 24, 1);
    const nextHeight = Math.max(viewportSize.height - 24, 1);
    const fit = Math.min(MAX_ZOOM, nextWidth / width, nextHeight / height);
    return isSketch ? fit : Math.max(MIN_ZOOM, fit);
  }, [imageDimensions, isSketch, viewportSize.height, viewportSize.width]);

  const clampZoom = useCallback(
    (value: number) => {
      return Math.min(MAX_ZOOM, Math.max(Math.min(MIN_ZOOM, getFitZoom()), value));
    },
    [getFitZoom],
  );

  const resetViewport = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const fitViewport = useCallback(() => {
    setZoom(getFitZoom());
    setPan({ x: 0, y: 0 });
  }, [getFitZoom]);

  const handleClose = useCallback(async () => {
    if (isSaving) return;
    if (dirtyRef.current) {
      const confirmed = await confirm({
        title: '关闭画板？',
        message: '当前画板还有未保存修改，关闭后这些修改会被丢弃。',
        confirmText: '关闭',
        cancelText: '继续编辑',
        tone: 'danger',
      });
      if (!confirmed) return;
    }
    onClose();
  }, [confirm, isSaving, onClose]);

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
    if (src === undefined) return;
    let cancelled = false;

    void loadWorkflowImage(src, { crossOrigin: 'anonymous' })
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
    if (!initialDimensions) return;

    const { width, height } = initialDimensions;
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
    if (loadedImage) context.drawImage(loadedImage, 0, 0, width, height);
    else {
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, width, height);
    }
    const initialSnapshot = { width, height, src: canvas.toDataURL('image/png') };
    renderedSnapshotRef.current = initialSnapshot;
    setHistory({ entries: [initialSnapshot], index: 0 });
    setIsRestoring(false);
    setIsDirty(false);
  }, [initialDimensions, loadedImage]);

  useEffect(() => {
    fitViewport();
  }, [fitViewport]);

  useLayoutEffect(() => {
    const canvas = paintCanvasRef.current;
    if (!canvas || !snapshot) return;
    if (renderedSnapshotRef.current === snapshot) {
      setIsRestoring(false);
      return;
    }
    const context = canvas.getContext('2d');
    if (!context) return;

    setIsRestoring(true);
    const image = new Image();
    image.onload = () => {
      if (canvas.width !== snapshot.width || canvas.height !== snapshot.height) {
        canvas.width = snapshot.width;
        canvas.height = snapshot.height;
      }
      context.globalCompositeOperation = 'source-over';
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0);
      renderedSnapshotRef.current = snapshot;
      setIsRestoring(false);
    };
    image.src = snapshot.src;
    return () => {
      image.onload = null;
    };
  }, [snapshot]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName;
      if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT' || target?.isContentEditable) return;

      if (event.key === 'Escape') {
        void handleClose();
        return;
      }

      const isModifierPressed = event.ctrlKey || event.metaKey;
      if (!isModifierPressed || isDrawing || isSaving) return;

      if (event.key.toLowerCase() === 'z' && !event.shiftKey) {
        event.preventDefault();
        setHistory((current) => (current.index <= 0 ? current : { ...current, index: current.index - 1 }));
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
  }, [handleClose, isDrawing, isSaving]);

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
    const snapshot = { width: canvas.width, height: canvas.height, src: canvas.toDataURL('image/png') };
    renderedSnapshotRef.current = snapshot;
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

  function paintCurve(start: BrushPoint, control: BrushPoint, end: BrushPoint) {
    const context = paintCanvasRef.current?.getContext('2d');
    if (!context) return;

    context.globalCompositeOperation = tool === 'eraser' && !isSketch ? 'destination-out' : 'source-over';
    const color = isSketch && tool === 'eraser' ? '#ffffff' : paintColor;
    context.fillStyle = color;
    if (start.radius === control.radius && control.radius === end.radius && (start.x !== end.x || start.y !== end.y)) {
      context.lineWidth = start.radius * 2;
      context.lineCap = 'round';
      context.strokeStyle = color;
      context.beginPath();
      context.moveTo(start.x, start.y);
      context.quadraticCurveTo(control.x, control.y, end.x, end.y);
      context.stroke();
      return;
    }

    // Midpoints join consecutive quadratic curves with a shared tangent.
    // Closely spaced circles follow the curve while interpolating the brush radius.
    const length =
      Math.hypot(control.x - start.x, control.y - start.y) + Math.hypot(end.x - control.x, end.y - control.y);
    const steps = Math.max(1, Math.ceil(length / Math.max(0.5, Math.min(2, start.radius / 4, end.radius / 4))));
    context.beginPath();
    for (let step = 0; step <= steps; step++) {
      const t = step / steps;
      const a = (1 - t) ** 2;
      const b = 2 * t * (1 - t);
      const c = t ** 2;
      const x = a * start.x + b * control.x + c * end.x;
      const y = a * start.y + b * control.y + c * end.y;
      const radius = a * start.radius + b * control.radius + c * end.radius;
      context.moveTo(x + radius, y);
      context.arc(x, y, radius, 0, Math.PI * 2);
    }
    context.fill();
  }

  function getBrushPoint(event: PointerEvent, rect: DOMRect, canvas: HTMLCanvasElement): BrushPoint {
    const pressure = event.pointerType === 'pen' ? Math.max(0.12, Math.min(1, event.pressure)) : 1;
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
      radius: Math.max(0.5, (brushSize * pressure) / 2),
    };
  }

  function appendBrushPoint(stroke: NonNullable<typeof strokeRef.current>, point: BrushPoint) {
    const midpoint = brushMidpoint(stroke.last, point);
    paintCurve(stroke.midpoint, stroke.last, midpoint);
    stroke.midpoint = midpoint;
    stroke.last = point;
  }

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

  function finishDrawing(event: ReactPointerEvent<HTMLCanvasElement>, includeEndpoint = false) {
    const stroke = strokeRef.current;
    if (!stroke || stroke.pointerId !== event.pointerId) return;

    if (includeEndpoint) {
      const canvas = event.currentTarget;
      const rect = canvas.getBoundingClientRect();
      if (rect.width && rect.height) {
        const endpoint = getBrushPoint(event.nativeEvent, rect, canvas);
        if (endpoint.x !== stroke.last.x || endpoint.y !== stroke.last.y) {
          appendBrushPoint(stroke, { ...endpoint, radius: stroke.last.radius });
        }
      }
    }
    paintCurve(stroke.midpoint, stroke.last, stroke.last);
    strokeRef.current = null;
    setIsDrawing(false);
    pushSnapshot();
  }

  const clearCanvas = useCallback(() => {
    const canvas = paintCanvasRef.current;
    if (!canvas || !imageDimensions) return;
    const context = canvas.getContext('2d');
    if (!context) return;

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.globalCompositeOperation = 'source-over';
    if (loadedImage) context.drawImage(loadedImage, 0, 0, canvas.width, canvas.height);
    else {
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    pushSnapshot();
    setIsDirty(true);
  }, [imageDimensions, loadedImage, pushSnapshot]);

  function resizeSketch({ width, height }: CanvasDimensions) {
    const canvas = paintCanvasRef.current;
    if (!canvas || (canvas.width === width && canvas.height === height)) return;
    const resized = document.createElement('canvas');
    resized.width = width;
    resized.height = height;
    const context = resized.getContext('2d');
    const paintContext = canvas.getContext('2d');
    if (!context || !paintContext) return;

    const scale = Math.min(1, width / canvas.width, height / canvas.height);
    const contentWidth = canvas.width * scale;
    const contentHeight = canvas.height * scale;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(canvas, (width - contentWidth) / 2, (height - contentHeight) / 2, contentWidth, contentHeight);
    canvas.width = width;
    canvas.height = height;
    paintContext.drawImage(resized, 0, 0);
    setCursorPoint(null);
    pushSnapshot();
    setIsDirty(true);
  }

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
    const file = new File([blob], isSketch ? 'sketch.png' : 'painted-image.png', { type: 'image/png' });
    return { file, previewUrl };
  }, [isSketch]);

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

  const isCanvasEditorAvailable = Boolean(imageDimensions);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="node-canvas-editor-modal" onClick={() => void handleClose()}>
      <div className="node-canvas-editor-modal__dialog glass" onClick={(event) => event.stopPropagation()}>
        <div className="node-canvas-editor-modal__header">
          <div className="workflow-toolbar__badge">
            <NotePencil size={16} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="node-canvas-editor-modal__eyebrow">Canvas</div>
            <div className="node-canvas-editor-modal__title">{nodeLabel}</div>
          </div>
          <button
            type="button"
            onClick={() => void handleClose()}
            className="node-canvas-editor-modal__icon-button"
            aria-label="关闭画板"
          >
            <X size={16} />
          </button>
        </div>

        <div className="node-canvas-editor-modal__toolbar">
          <div className="node-canvas-editor-modal__tool-group">
            <button type="button" className={tool === 'brush' ? 'is-active' : ''} onClick={() => setTool('brush')}>
              <NotePencil size={14} /> 画笔
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
                setHistory((current) => (current.index <= 0 ? current : { ...current, index: current.index - 1 }))
              }
              disabled={isDrawing || isSaving || history.index <= 0}
            >
              <ArrowCounterClockwise size={14} /> 撤销
            </button>
            <button
              type="button"
              onClick={() =>
                setHistory((current) =>
                  current.index >= current.entries.length - 1 ? current : { ...current, index: current.index + 1 },
                )
              }
              disabled={isDrawing || isSaving || history.index >= history.entries.length - 1}
            >
              <ArrowClockwise size={14} /> 重做
            </button>
            <button type="button" onClick={clearCanvas} disabled={isRestoring}>
              <Trash size={14} /> 清空
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

        {isSketch && imageDimensions && (
          <SketchSizeControls
            key={`${imageDimensions.width}x${imageDimensions.height}`}
            dimensions={imageDimensions}
            disabled={isDrawing || isSaving || isRestoring}
            onApply={resizeSketch}
          />
        )}

        <div className="node-canvas-editor-modal__note">
          {isSketch ? '保存后，草图会作为图片填入当前 IO 节点。' : '保存后将笔触合成到当前图片。'}
        </div>

        <div ref={viewportRef} className="node-canvas-editor-modal__viewport" onWheel={handleViewportWheel}>
          {!isSketch && !src ? (
            <div className="node-canvas-editor-modal__loading">当前没有可编辑的图片。</div>
          ) : isCanvasEditorAvailable ? (
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
                  if (isRestoring || isSaving || strokeRef.current || panPointerIdRef.current !== null) return;
                  const shouldPan = event.button === 1 || viewMode === 'pan';
                  if (shouldPan) {
                    event.preventDefault();
                    beginPan(event);
                    return;
                  }
                  if (event.button !== 0) return;
                  const canvas = event.currentTarget;
                  const rect = canvas.getBoundingClientRect();
                  if (!rect.width || !rect.height) return;
                  event.preventDefault();
                  const point = getBrushPoint(event.nativeEvent, rect, canvas);
                  canvas.setPointerCapture(event.pointerId);
                  strokeRef.current = { pointerId: event.pointerId, last: point, midpoint: point };
                  setIsDrawing(true);
                  setCursorPoint(point);
                  paintCurve(point, point, point);
                  setIsDirty(true);
                }}
                onPointerMove={(event) => {
                  if (panPointerIdRef.current === event.pointerId) {
                    updatePan(event);
                    return;
                  }
                  const stroke = strokeRef.current;
                  if (stroke && stroke.pointerId !== event.pointerId) return;
                  const canvas = event.currentTarget;
                  const rect = canvas.getBoundingClientRect();
                  if (!rect.width || !rect.height) return;
                  const nativeEvent = event.nativeEvent;
                  setCursorPoint(getBrushPoint(nativeEvent, rect, canvas));
                  if (!stroke) return;
                  const samples = nativeEvent.getCoalescedEvents?.();
                  for (const sample of samples?.length ? samples : [nativeEvent]) {
                    appendBrushPoint(stroke, getBrushPoint(sample, rect, canvas));
                  }
                }}
                onPointerUp={(event) => {
                  if (panPointerIdRef.current === event.pointerId) endPan(event);
                  else finishDrawing(event, true);
                }}
                onPointerLeave={() => setCursorPoint(null)}
                onPointerCancel={(event) => {
                  if (panPointerIdRef.current === event.pointerId) endPan(event);
                  else finishDrawing(event);
                }}
                onLostPointerCapture={(event) => {
                  if (panPointerIdRef.current === event.pointerId) endPan();
                  else finishDrawing(event);
                }}
              />
            </div>
          ) : (
            <div className="node-canvas-editor-modal__loading">正在加载源图...</div>
          )}
        </div>

        <div className="node-canvas-editor-modal__footer">
          <div className="node-canvas-editor-modal__status">
            {error || (isDirty ? '有未保存修改' : isSketch ? '' : '当前内容已同步')}
          </div>
          <div className="node-canvas-editor-modal__actions">
            <button
              type="button"
              className="node-canvas-editor-modal__secondary"
              onClick={() => void handleClose()}
              disabled={isSaving}
            >
              取消
            </button>
            {!isSketch && (
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
            )}
            <button
              type="button"
              className="node-canvas-editor-modal__primary"
              onClick={() => {
                void save(true);
              }}
              disabled={isSaving || isRestoring || !isCanvasEditorAvailable || (isSketch && !isDirty)}
            >
              {isSaving ? '保存中...' : isSketch ? '保存到 IO 节点' : '保存图片'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function SketchSizeControls({
  dimensions,
  disabled,
  onApply,
}: {
  dimensions: CanvasDimensions;
  disabled: boolean;
  onApply: (dimensions: CanvasDimensions) => void;
}) {
  const [width, setWidth] = useState(String(dimensions.width));
  const [height, setHeight] = useState(String(dimensions.height));
  const pixelWidth = Number(width);
  const pixelHeight = Number(height);
  const validSize = [pixelWidth, pixelHeight].every(
    (side) => Number.isInteger(side) && side >= MIN_SKETCH_SIDE && side <= MAX_SKETCH_SIDE,
  );
  const ratio = SKETCH_RATIOS.find(([x, y]) => pixelWidth > 0 && pixelWidth * y === pixelHeight * x);

  return (
    <form
      className="node-canvas-editor-modal__sketch-size"
      onSubmit={(event) => {
        event.preventDefault();
        if (!disabled && validSize) onApply({ width: pixelWidth, height: pixelHeight });
      }}
    >
      <label>
        画布比例
        <select
          value={ratio?.join(':') ?? ''}
          disabled={disabled}
          onChange={(event) => {
            if (!event.target.value) return;
            const [x, y] = event.target.value.split(':').map(Number);
            const longest = Math.max(dimensions.width, dimensions.height);
            const unit = Math.max(Math.ceil(MIN_SKETCH_SIDE / Math.min(x, y)), Math.floor(longest / Math.max(x, y)));
            setWidth(String(unit * x));
            setHeight(String(unit * y));
          }}
        >
          <option value="">自定义</option>
          {SKETCH_RATIOS.map(([x, y]) => (
            <option key={`${x}:${y}`}>
              {x}:{y}
            </option>
          ))}
        </select>
      </label>
      <label>
        宽度 (px)
        <input
          type="number"
          min={MIN_SKETCH_SIDE}
          max={MAX_SKETCH_SIDE}
          value={width}
          disabled={disabled}
          onChange={(event) => setWidth(event.target.value)}
        />
      </label>
      <label>
        高度 (px)
        <input
          type="number"
          min={MIN_SKETCH_SIDE}
          max={MAX_SKETCH_SIDE}
          value={height}
          disabled={disabled}
          onChange={(event) => setHeight(event.target.value)}
        />
      </label>
      <button
        type="submit"
        className="node-canvas-editor-modal__secondary"
        disabled={disabled || !validSize || (pixelWidth === dimensions.width && pixelHeight === dimensions.height)}
      >
        应用尺寸
      </button>
      {!validSize && (
        <span role="status">
          宽高需为 {MIN_SKETCH_SIDE}–{MAX_SKETCH_SIDE} px 的整数
        </span>
      )}
    </form>
  );
}
