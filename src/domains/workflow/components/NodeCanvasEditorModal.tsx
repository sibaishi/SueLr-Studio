import { Check, Eraser, Eye, EyeOff, Hand, Pencil, RotateCcw, RotateCw, Trash2, X } from 'lucide-react';
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

type EditorMode = 'paint' | 'mask';
type ToolMode = 'brush' | 'eraser';
type ViewMode = 'draw' | 'pan';

interface NodeCanvasEditorModalProps {
  src: string;
  initialMaskSrc?: string;
  nodeLabel?: string;
  initialMode?: EditorMode;
  onClose: () => void;
  onSavePaint?: (file: File, previewUrl: string) => Promise<void>;
  onSaveMask: (file: File, previewUrl: string) => Promise<void>;
  onClearMask?: () => Promise<void>;
}

type SnapshotHistory = {
  entries: string[];
  index: number;
};

type HistoryMap = Record<EditorMode, SnapshotHistory>;

const DEFAULT_BRUSH_SIZE = 26;
const DEFAULT_MASK_BACKGROUND_OPACITY = 0.38;
const MIN_ZOOM = 0.35;
const MAX_ZOOM = 4;

function formatCanvasEditorError(message?: string | null) {
  const detail = String(message || '').trim();
  return detail ? `保存没有完成，请稍后重试。${detail}` : '保存没有完成，请稍后重试。';
}

function createEmptyHistory(): HistoryMap {
  return {
    paint: { entries: [], index: -1 },
    mask: { entries: [], index: -1 },
  };
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

function isBlankMaskCanvas(canvas: HTMLCanvasElement) {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return false;
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index + 3] === 0) continue;
    if (pixels[index] > 8 || pixels[index + 1] > 8 || pixels[index + 2] > 8) return false;
  }
  return true;
}

export function NodeCanvasEditorModal({
  src,
  initialMaskSrc,
  nodeLabel = '图像输入',
  initialMode = 'mask',
  onClose,
  onSavePaint,
  onSaveMask,
  onClearMask,
}: NodeCanvasEditorModalProps) {
  const [mode, setMode] = useState<EditorMode>(initialMode);
  const [tool, setTool] = useState<ToolMode>('brush');
  const [brushSize, setBrushSize] = useState(DEFAULT_BRUSH_SIZE);
  const [paintColor, setPaintColor] = useState('#ff375f');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [loadedImage, setLoadedImage] = useState<HTMLImageElement | null>(null);
  const [histories, setHistories] = useState<HistoryMap>(createEmptyHistory);
  const [maskBackgroundOpacity, setMaskBackgroundOpacity] = useState(DEFAULT_MASK_BACKGROUND_OPACITY);
  const [showReferenceImage, setShowReferenceImage] = useState(true);
  const [maskInverted, setMaskInverted] = useState(false);
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
  const baseCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const paintCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const paintPreviewUrlRef = useRef<string>('');
  const maskPreviewUrlRef = useRef<string>('');
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const brushPreviewTimerRef = useRef<number | null>(null);

  const activeCanvasRef = mode === 'paint' ? paintCanvasRef : maskCanvasRef;
  const currentHistory = histories[mode];
  const canSavePaint = Boolean(onSavePaint);
  const brushCursorColor =
    mode === 'paint'
      ? tool === 'eraser'
        ? '#ffffff'
        : paintColor
      : tool === 'eraser'
        ? maskInverted
          ? '#ffffff'
          : '#000000'
        : maskInverted
          ? '#000000'
          : '#ffffff';

  const revokePreviewUrls = useCallback(() => {
    if (paintPreviewUrlRef.current) {
      URL.revokeObjectURL(paintPreviewUrlRef.current);
      paintPreviewUrlRef.current = '';
    }
    if (maskPreviewUrlRef.current) {
      URL.revokeObjectURL(maskPreviewUrlRef.current);
      maskPreviewUrlRef.current = '';
    }
  }, []);

  const showBrushPreviewTemporarily = useCallback(() => {
    setShowBrushSizePreview(true);
    if (brushPreviewTimerRef.current !== null) {
      window.clearTimeout(brushPreviewTimerRef.current);
    }
    brushPreviewTimerRef.current = window.setTimeout(() => {
      brushPreviewTimerRef.current = null;
      setShowBrushSizePreview(false);
    }, 700);
  }, []);

  const handleBrushSizeChange = useCallback(
    (nextSize: number) => {
      setBrushSize(nextSize);
      showBrushPreviewTemporarily();
    },
    [showBrushPreviewTemporarily],
  );

  useEffect(() => {
    return () => {
      if (brushPreviewTimerRef.current !== null) {
        window.clearTimeout(brushPreviewTimerRef.current);
      }
    };
  }, []);

  const applyHistorySnapshot = useCallback((targetMode: EditorMode, snapshot: string) => {
    const canvas = targetMode === 'paint' ? paintCanvasRef.current : maskCanvasRef.current;
    if (!canvas || !snapshot) return;
    const context = canvas.getContext('2d');
    if (!context) return;

    const image = new Image();
    image.onload = () => {
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
    };
    image.src = snapshot;
  }, []);

  const pushSnapshotForMode = useCallback((targetMode: EditorMode) => {
    const canvas = targetMode === 'paint' ? paintCanvasRef.current : maskCanvasRef.current;
    if (!canvas) return;
    const snapshot = canvas.toDataURL('image/png');
    setHistories((current) => {
      const history = current[targetMode];
      const nextEntries = history.entries.slice(0, history.index + 1);
      nextEntries.push(snapshot);
      const trimmedEntries = nextEntries.slice(-30);
      return {
        ...current,
        [targetMode]: {
          entries: trimmedEntries,
          index: trimmedEntries.length - 1,
        },
      };
    });
  }, []);

  const clampZoom = useCallback((value: number) => {
    return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
  }, []);

  const imageDimensions = useMemo(() => {
    if (!loadedImage) return null;
    return {
      width: loadedImage.naturalWidth || loadedImage.width,
      height: loadedImage.naturalHeight || loadedImage.height,
    };
  }, [loadedImage]);

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
        setHistories((current) => {
          const history = current[mode];
          if (history.index <= 0) return current;
          return {
            ...current,
            [mode]: {
              ...history,
              index: history.index - 1,
            },
          };
        });
        return;
      }

      if ((event.key.toLowerCase() === 'z' && event.shiftKey) || event.key.toLowerCase() === 'y') {
        event.preventDefault();
        setHistories((current) => {
          const history = current[mode];
          if (history.index >= history.entries.length - 1) return current;
          return {
            ...current,
            [mode]: {
              ...history,
              index: history.index + 1,
            },
          };
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleClose, mode]);

  useEffect(() => revokePreviewUrls, [revokePreviewUrls]);

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
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => updateViewportSize()) : null;
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
    const baseCanvas = baseCanvasRef.current;
    const paintCanvas = paintCanvasRef.current;
    const maskCanvas = maskCanvasRef.current;
    if (!baseCanvas || !paintCanvas || !maskCanvas) return;

    for (const canvas of [baseCanvas, paintCanvas, maskCanvas]) {
      canvas.width = width;
      canvas.height = height;
    }

    const baseContext = baseCanvas.getContext('2d');
    const paintContext = paintCanvas.getContext('2d');
    const maskContext = maskCanvas.getContext('2d');
    if (!baseContext || !paintContext || !maskContext) {
      setError('画板没有准备好，请关闭后重新打开再试。');
      return;
    }

    baseContext.clearRect(0, 0, width, height);
    baseContext.drawImage(loadedImage, 0, 0, width, height);

    paintContext.clearRect(0, 0, width, height);
    paintContext.drawImage(loadedImage, 0, 0, width, height);

    maskContext.clearRect(0, 0, width, height);
    maskContext.fillStyle = '#000';
    maskContext.fillRect(0, 0, width, height);

    const nextHistories = createEmptyHistory();
    nextHistories.paint = {
      entries: [paintCanvas.toDataURL('image/png')],
      index: 0,
    };

    if (!initialMaskSrc) {
      nextHistories.mask = {
        entries: [maskCanvas.toDataURL('image/png')],
        index: 0,
      };
      setHistories(nextHistories);
      setIsDirty(false);
      setMaskInverted(false);
      fitViewport();
      return;
    }

    let cancelled = false;
    void loadImage(initialMaskSrc)
      .then((maskImage) => {
        if (cancelled) return;
        maskContext.clearRect(0, 0, width, height);
        maskContext.drawImage(maskImage, 0, 0, width, height);
        nextHistories.mask = {
          entries: [maskCanvas.toDataURL('image/png')],
          index: 0,
        };
        setHistories(nextHistories);
        setIsDirty(false);
        setMaskInverted(false);
        fitViewport();
      })
      .catch(() => {
        if (cancelled) return;
        nextHistories.mask = {
          entries: [maskCanvas.toDataURL('image/png')],
          index: 0,
        };
        setHistories(nextHistories);
        setIsDirty(false);
        setMaskInverted(false);
        fitViewport();
      });

    return () => {
      cancelled = true;
    };
  }, [fitViewport, initialMaskSrc, loadedImage]);

  useEffect(() => {
    const paintSnapshot = histories.paint.entries[histories.paint.index];
    if (paintSnapshot) applyHistorySnapshot('paint', paintSnapshot);
  }, [applyHistorySnapshot, histories.paint.entries, histories.paint.index]);

  useEffect(() => {
    const maskSnapshot = histories.mask.entries[histories.mask.index];
    if (maskSnapshot) applyHistorySnapshot('mask', maskSnapshot);
  }, [applyHistorySnapshot, histories.mask.entries, histories.mask.index]);

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
      const canvas = activeCanvasRef.current;
      if (!canvas) return;
      const context = canvas.getContext('2d');
      if (!context) return;

      context.lineCap = 'round';
      context.lineJoin = 'round';
      context.lineWidth = brushSize;

      if (mode === 'paint') {
        context.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
        context.strokeStyle = paintColor;
        context.fillStyle = paintColor;
      } else {
        context.globalCompositeOperation = 'source-over';
        const activeColor = maskInverted ? '#000000' : '#ffffff';
        const eraseColor = maskInverted ? '#ffffff' : '#000000';
        context.strokeStyle = tool === 'eraser' ? eraseColor : activeColor;
        context.fillStyle = tool === 'eraser' ? eraseColor : activeColor;
      }

      context.beginPath();
      context.moveTo(from.x, from.y);
      context.lineTo(to.x, to.y);
      context.stroke();
      context.beginPath();
      context.arc(to.x, to.y, brushSize / 2, 0, Math.PI * 2);
      context.fill();
    },
    [activeCanvasRef, brushSize, maskInverted, mode, paintColor, tool],
  );

  const getPointerPosition = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const canvas = activeCanvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return null;
      return {
        x: ((event.clientX - rect.left) / rect.width) * canvas.width,
        y: ((event.clientY - rect.top) / rect.height) * canvas.height,
      };
    },
    [activeCanvasRef],
  );

  const handleViewportWheel = useCallback(
    (event: ReactWheelEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (!imageDimensions) return;
      const canvas = activeCanvasRef.current;
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

        setPan((currentPan) => {
          return {
            x: currentPan.x + pointerOffsetX - pointerOffsetX * zoomRatio,
            y: currentPan.y + pointerOffsetY - pointerOffsetY * zoomRatio,
          };
        });

        return nextZoom;
      });
    },
    [activeCanvasRef, clampZoom, imageDimensions],
  );

  const finishDrawing = useCallback(() => {
    if (!isDrawing) return;
    setIsDrawing(false);
    lastPointRef.current = null;
    pushSnapshotForMode(mode);
    setIsDirty(true);
  }, [isDrawing, mode, pushSnapshotForMode]);

  const invertMaskCanvas = useCallback(() => {
    const canvas = maskCanvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return;
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = imageData.data;
    for (let index = 0; index < pixels.length; index += 4) {
      const value = pixels[index] > 127 ? 0 : 255;
      pixels[index] = value;
      pixels[index + 1] = value;
      pixels[index + 2] = value;
      pixels[index + 3] = 255;
    }
    context.putImageData(imageData, 0, 0);
    setMaskInverted((current) => !current);
    pushSnapshotForMode('mask');
    setIsDirty(true);
  }, [pushSnapshotForMode]);

  const isCanvasEditorAvailable = Boolean(loadedImage);
  const hasSourceImage = Boolean(src);

  const clearActiveCanvas = useCallback(() => {
    const canvas = activeCanvasRef.current;
    if (!canvas || !loadedImage) return;
    const context = canvas.getContext('2d');
    if (!context) return;

    context.clearRect(0, 0, canvas.width, canvas.height);
    if (mode === 'paint') {
      context.drawImage(loadedImage, 0, 0, canvas.width, canvas.height);
    } else {
      context.fillStyle = '#000';
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    pushSnapshotForMode(mode);
    setIsDirty(true);
  }, [activeCanvasRef, loadedImage, mode, pushSnapshotForMode]);

  const exportCanvasToFile = useCallback(async (canvas: HTMLCanvasElement, filename: string) => {
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((nextBlob) => {
        if (nextBlob) resolve(nextBlob);
        else reject(new Error('无法生成图片文件'));
      }, 'image/png');
    });
    const previewUrl = URL.createObjectURL(blob);
    const file = new File([blob], filename, { type: 'image/png' });
    return { file, previewUrl };
  }, []);

  const buildPaintComposite = useCallback(() => {
    const paintCanvas = paintCanvasRef.current;
    if (!paintCanvas) return null;
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = paintCanvas.width;
    exportCanvas.height = paintCanvas.height;
    const context = exportCanvas.getContext('2d');
    if (!context) return null;
    context.drawImage(paintCanvas, 0, 0);
    return exportCanvas;
  }, []);

  const saveCurrentMode = useCallback(
    async (closeAfterSave: boolean) => {
      try {
        setIsSaving(true);
        setError('');

        if (mode === 'paint') {
          if (!onSavePaint) throw new Error('当前节点暂不支持回写原图，请改为保存遮罩。');
          const exportCanvas = buildPaintComposite();
          if (!exportCanvas) throw new Error('无法导出当前绘制结果，请稍后重试。');
          const { file, previewUrl } = await exportCanvasToFile(exportCanvas, 'painted-image.png');
          if (paintPreviewUrlRef.current) URL.revokeObjectURL(paintPreviewUrlRef.current);
          paintPreviewUrlRef.current = previewUrl;
          await onSavePaint(file, previewUrl);
        } else {
          const maskCanvas = maskCanvasRef.current;
          if (!maskCanvas) throw new Error('无法导出当前遮罩结果，请稍后重试。');
          if (isBlankMaskCanvas(maskCanvas)) {
            await onClearMask?.();
            setIsDirty(false);
            dirtyRef.current = false;
            if (closeAfterSave) onClose();
            return;
          }
          const { file, previewUrl } = await exportCanvasToFile(maskCanvas, 'mask-image.png');
          if (maskPreviewUrlRef.current) URL.revokeObjectURL(maskPreviewUrlRef.current);
          maskPreviewUrlRef.current = previewUrl;
          await onSaveMask(file, previewUrl);
        }

        setIsDirty(false);
        dirtyRef.current = false;
        if (closeAfterSave) onClose();
      } catch (nextError) {
        setError(formatCanvasEditorError(nextError instanceof Error ? nextError.message : ''));
      } finally {
        setIsSaving(false);
      }
    },
    [buildPaintComposite, exportCanvasToFile, mode, onClose, onSaveMask, onSavePaint],
  );

  const handleSave = useCallback(async () => {
    await saveCurrentMode(true);
  }, [saveCurrentMode]);

  const handleSaveAndContinue = useCallback(async () => {
    await saveCurrentMode(false);
  }, [saveCurrentMode]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="node-canvas-editor-modal" onClick={handleClose}>
      <div className="node-canvas-editor-modal__dialog glass" onClick={(event) => event.stopPropagation()}>
        <div className="node-canvas-editor-modal__header">
          <div>
            <div className="node-canvas-editor-modal__eyebrow">节点画板</div>
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
          <div className="node-canvas-editor-modal__segmented">
            <button type="button" className={mode === 'mask' ? 'is-active' : ''} onClick={() => setMode('mask')}>
              遮罩绘制
            </button>
            <button
              type="button"
              className={mode === 'paint' ? 'is-active' : ''}
              onClick={() => setMode('paint')}
              disabled={!canSavePaint}
            >
              原图绘制
            </button>
          </div>

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
                setHistories((current) => {
                  const history = current[mode];
                  if (history.index <= 0) return current;
                  return { ...current, [mode]: { ...history, index: history.index - 1 } };
                })
              }
              disabled={currentHistory.index <= 0}
            >
              <RotateCcw size={14} /> 撤销
            </button>
            <button
              type="button"
              onClick={() =>
                setHistories((current) => {
                  const history = current[mode];
                  if (history.index >= history.entries.length - 1) return current;
                  return { ...current, [mode]: { ...history, index: history.index + 1 } };
                })
              }
              disabled={currentHistory.index >= currentHistory.entries.length - 1}
            >
              <RotateCw size={14} /> 重做
            </button>
            <button type="button" onClick={clearActiveCanvas}>
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

          {mode === 'paint' && (
            <label className="node-canvas-editor-modal__color-picker">
              <span>颜色</span>
              <span
                className="node-canvas-editor-modal__color-swatch"
                style={{ '--paint-color': paintColor } as CSSProperties}
              >
                <input type="color" value={paintColor} onChange={(event) => setPaintColor(event.target.value)} />
              </span>
            </label>
          )}

          {mode === 'mask' && (
            <>
              <label className="node-canvas-editor-modal__slider">
                <span>底图 {Math.round(maskBackgroundOpacity * 100)}%</span>
                <input
                  type="range"
                  min={0}
                  max={80}
                  step={1}
                  value={Math.round(maskBackgroundOpacity * 100)}
                  style={
                    { '--range-progress': `${(Math.round(maskBackgroundOpacity * 100) / 80) * 100}%` } as CSSProperties
                  }
                  onChange={(event) => setMaskBackgroundOpacity(Number(event.target.value) / 100)}
                  disabled={!showReferenceImage}
                />
              </label>
              <div className="node-canvas-editor-modal__tool-group">
                <button
                  type="button"
                  className={showReferenceImage ? 'is-active' : ''}
                  onClick={() => setShowReferenceImage((current) => !current)}
                >
                  {showReferenceImage ? <Eye size={14} /> : <EyeOff size={14} />} 参考图
                </button>
                <button type="button" onClick={invertMaskCanvas}>
                  反相遮罩
                </button>
              </div>
            </>
          )}

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

        <div className="node-canvas-editor-modal__note">
          {mode === 'mask'
            ? `遮罩模式下以纯黑底生成 mask，${showReferenceImage ? '半透明原图只作为参考层' : '当前已隐藏参考图'}，不参与最终遮罩导出。${maskInverted ? '当前黑色区域代表遮罩。' : '当前白色区域代表遮罩。'}桌面端滚轮缩放，按住中键可拖动画面。`
            : '原图绘制模式会把你的笔触合成到当前图片中。'}
        </div>

        <div ref={viewportRef} className="node-canvas-editor-modal__viewport" onWheel={handleViewportWheel}>
          {!hasSourceImage ? (
            <div className="node-canvas-editor-modal__loading">
              当前节点还没有可编辑的图片，请先上传图片，再打开画板。
            </div>
          ) : loadedImage ? (
            <div className="node-canvas-editor-modal__canvas-stack" style={canvasStyle}>
              <div className={`node-canvas-editor-modal__mask-base ${mode === 'mask' ? 'is-visible' : ''}`} />
              <canvas
                ref={baseCanvasRef}
                className={`node-canvas-editor-modal__canvas node-canvas-editor-modal__base-canvas ${mode === 'mask' ? 'node-canvas-editor-modal__base-canvas--mask' : ''}`}
                style={mode === 'mask' ? { opacity: showReferenceImage ? maskBackgroundOpacity : 0 } : undefined}
              />
              {cursorPoint && viewMode === 'draw' && (
                <div
                  className="node-canvas-editor-modal__brush-cursor"
                  style={
                    {
                      left: `${(cursorPoint.x / (activeCanvasRef.current?.width || 1)) * 100}%`,
                      top: `${(cursorPoint.y / (activeCanvasRef.current?.height || 1)) * 100}%`,
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
                className={`node-canvas-editor-modal__canvas ${mode === 'paint' ? 'is-active' : 'is-hidden'}`}
                onPointerDown={(event) => {
                  const shouldPan = event.button === 1 || viewMode === 'pan';
                  if (shouldPan) {
                    event.preventDefault();
                    beginPan(event);
                    return;
                  }
                  if (mode !== 'paint') return;
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
                  const shouldPan = panPointerIdRef.current === event.pointerId;
                  if (shouldPan) {
                    updatePan(event);
                    return;
                  }
                  const point = getPointerPosition(event);
                  if (point) setCursorPoint(point);
                  if (!isDrawing || mode !== 'paint') return;
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
              <canvas
                ref={maskCanvasRef}
                className={`node-canvas-editor-modal__canvas ${mode === 'mask' ? 'is-active node-canvas-editor-modal__mask-canvas--preview' : 'is-hidden'}`}
                onPointerDown={(event) => {
                  const shouldPan = event.button === 1 || viewMode === 'pan';
                  if (shouldPan) {
                    event.preventDefault();
                    beginPan(event);
                    return;
                  }
                  if (mode !== 'mask') return;
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
                  const shouldPan = panPointerIdRef.current === event.pointerId;
                  if (shouldPan) {
                    updatePan(event);
                    return;
                  }
                  const point = getPointerPosition(event);
                  if (point) setCursorPoint(point);
                  if (!isDrawing || mode !== 'mask') return;
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
          <div className="node-canvas-editor-modal__status">
            {error || (isDirty ? '有未保存修改' : '当前内容已同步')}
          </div>
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
              onClick={handleSaveAndContinue}
              disabled={isSaving || !isCanvasEditorAvailable}
            >
              <Check size={14} /> 仅保存
            </button>
            <button
              type="button"
              className="node-canvas-editor-modal__primary"
              onClick={handleSave}
              disabled={isSaving || !isCanvasEditorAvailable}
            >
              {isSaving ? '保存中...' : mode === 'mask' ? '保存遮罩' : '保存图片'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
