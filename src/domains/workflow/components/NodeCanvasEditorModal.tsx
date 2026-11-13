import { ModalSurface } from '@/ui/ModalSurface';
import {
  isolateWorkflowModalKey,
  stopWorkflowModalEvent,
  useWorkflowModalIsolation,
  workflowModalPointerBoundary,
} from './workflowModalIsolation';
import { useWorkflowConfirm } from '@/domains/workflow/components/WorkflowConfirmDialog';
import {
  type CanvasPoint,
  type CanvasTransform,
  type TransformHandle,
  dragTransform,
  drawTransformed,
  findInkBounds,
  transformBounds,
} from './nodeCanvasTransform';
import { loadWorkflowImage } from '@/domains/workflow/lib/browserImage';
import {
  ArrowClockwise,
  ArrowCounterClockwise,
  Check,
  Eraser,
  Hand,
  Eye,
  EyeSlash,
  LockSimple,
  LockSimpleOpen,
  Plus,
  Copy,
  UploadSimple,
  ArrowUp,
  ArrowDown,
  DotsThree,
  Selection,
  CircleDashed,
  Lasso,
  PaintBucket,
  Gradient,
  BoundingBox,
  NotePencil,
  Trash,
  X,
} from '@phosphor-icons/react';
import {
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
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
import {
  type Marquee,
  type SelectionMode,
  combineSelection,
  makeSelectionMask,
  maskSelection,
  traceMarquee,
} from './nodeCanvasSelection';
import './NodeCanvasEditorModal.css';

type ToolMode = 'brush' | 'eraser' | 'selection' | 'fill' | 'gradient';
type ViewMode = 'draw' | 'pan';

type BrushPoint = { x: number; y: number; radius: number };

function brushMidpoint(a: BrushPoint, b: BrushPoint): BrushPoint {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, radius: (a.radius + b.radius) / 2 };
}

interface NodeCanvasEditorModalProps {
  src?: string;
  nodeLabel?: string;
  onClose: () => void;
  onSavePaint: (file: File) => Promise<void>;
  onExportLayer?: (file: File) => Promise<void>;
}

type CanvasDimensions = { width: number; height: number };
function lassoMarquee(points: CanvasPoint[]): Marquee | null {
  if (points.length < 3) return null;
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const point of points) {
    left = Math.min(left, point.x);
    top = Math.min(top, point.y);
    right = Math.max(right, point.x);
    bottom = Math.max(bottom, point.y);
  }
  if (left === right || top === bottom) return null;
  return {
    shape: 'lasso',
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
    points: points.map(({ x, y }) => ({ x: x - left, y: y - top })),
  };
}
type TransformSession = { source: HTMLCanvasElement; initial: CanvasTransform; frame: CanvasTransform };

type CanvasLayer = {
  id: string;
  name: string;
  pixels: HTMLCanvasElement;
  x: number;
  y: number;
  visible: boolean;
  locked: boolean;
  opacity: number;
  blend: GlobalCompositeOperation;
};
type CanvasSnapshot = CanvasDimensions & { layers: CanvasLayer[]; activeId: string };

const BLEND_MODES = [
  ['source-over', '正常'],
  ['multiply', '正片叠底'],
  ['screen', '滤色'],
  ['overlay', '叠加'],
] as const;

function createPixels(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

async function encodeCanvasPng(canvas: HTMLCanvasElement, name: string) {
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => {
      if (result) resolve(result);
      else reject(new Error('无法生成图片文件'));
    }, 'image/png');
  });
  return new File([blob], name, { type: 'image/png' });
}

function createLayer(name: string, pixels: HTMLCanvasElement, locked = false): CanvasLayer {
  return { id: crypto.randomUUID(), name, pixels, x: 0, y: 0, visible: true, locked, opacity: 1, blend: 'source-over' };
}

function renderDocument(
  canvas: HTMLCanvasElement,
  snapshot: CanvasSnapshot,
  isSketch: boolean,
  transform?: TransformSession | null,
) {
  if (canvas.width !== snapshot.width) canvas.width = snapshot.width;
  if (canvas.height !== snapshot.height) canvas.height = snapshot.height;
  const context = canvas.getContext('2d');
  if (!context) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
  if (isSketch) {
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  for (const layer of snapshot.layers) {
    if (!layer.visible) continue;
    context.globalAlpha = layer.opacity;
    context.globalCompositeOperation = layer.blend;
    if (transform && layer.id === snapshot.activeId) drawTransformed(context, transform.source, transform.frame);
    else context.drawImage(layer.pixels, layer.x, layer.y);
  }
  context.globalAlpha = 1;
  context.globalCompositeOperation = 'source-over';
}

type SnapshotHistory = {
  entries: CanvasSnapshot[];
  index: number;
};

const SKETCH_DIMENSIONS = { width: 768, height: 768 };
const MIN_SKETCH_SIDE = 64;
const MAX_SKETCH_SIDE = 2048;
const MAX_IMAGE_SIDE = 8192;
const MAX_CANVAS_PIXELS = 32_000_000;
const HISTORY_PIXEL_BUDGET = 64_000_000;
const SKETCH_RATIOS = [
  [1, 1],
  [4, 3],
  [3, 4],
  [4, 5],
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

export function NodeCanvasEditorModal({
  src,
  nodeLabel = '画板',
  onClose,
  onSavePaint,
  onExportLayer,
}: NodeCanvasEditorModalProps) {
  const confirm = useWorkflowConfirm();
  const isSketch = src === undefined;
  const [sizeMode, setSizeMode] = useState<'canvas' | 'image' | 'layer'>('canvas');
  const [tool, setTool] = useState<ToolMode>('brush');
  const [brushSize, setBrushSize] = useState(DEFAULT_BRUSH_SIZE);
  const [gradientEndColor, setGradientEndColor] = useState('#ffffff');
  const [gradientGuide, setGradientGuide] = useState<{ start: CanvasPoint; end: CanvasPoint } | null>(null);
  const gradientDrag = useRef<{ pointerId: number; start: CanvasPoint } | null>(null);
  const isBrushTool = tool === 'brush' || tool === 'eraser';
  const [paintColor, setPaintColor] = useState(isSketch ? '#222222' : '#ff375f');
  const [exportMessage, setExportMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedSnapshot, setSavedSnapshot] = useState<CanvasSnapshot | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [selection, setSelection] = useState<Marquee | null>(null);
  const [marqueeShape, setMarqueeShape] = useState<Exclude<Marquee['shape'], 'mask'>>('rectangle');
  const [transform, setTransform] = useState<TransformSession | null>(null);
  const transformDrag = useRef<{
    pointerId: number;
    handle: TransformHandle;
    point: CanvasPoint;
    frame: CanvasTransform;
  } | null>(null);
  const [draggedLayer, setDraggedLayer] = useState<string | null>(null);
  const [layerDrop, setLayerDrop] = useState<{ id: string; above: boolean } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [holdPan, setHoldPan] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [selectionMode, setSelectionMode] = useState<SelectionMode>('replace');
  const [feather, setFeather] = useState(0);
  const maskedStroke = useRef<HTMLCanvasElement | null>(null);
  const maskedPreview = useRef<HTMLCanvasElement | null>(null);
  const selectionStart = useRef<{
    pointerId: number;
    x: number;
    y: number;
    previous: Marquee | null;
    mode: SelectionMode;
    move: boolean;
    points?: CanvasPoint[];
  } | null>(null);
  const strokeDocument = useRef<CanvasSnapshot | null>(null);
  const [loadedImage, setLoadedImage] = useState<HTMLImageElement | null>(null);
  const [history, setHistory] = useState<SnapshotHistory>({ entries: [], index: -1 });
  const [viewMode, setViewMode] = useState<ViewMode>('draw');
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [cursorPoint, setCursorPoint] = useState<{ x: number; y: number } | null>(null);
  const [showBrushSizePreview, setShowBrushSizePreview] = useState(false);

  const dirtyRef = useRef(false);
  const confirmingClose = useRef(false);
  const panPointerIdRef = useRef<number | null>(null);
  const panStartRef = useRef<{ x: number; y: number; originX: number; originY: number } | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const paintCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const layerCount = useRef(0);
  const importInput = useRef<HTMLInputElement | null>(null);
  const strokeRef = useRef<{ pointerId: number; last: BrushPoint; midpoint: BrushPoint; touchesLayer: boolean } | null>(
    null,
  );
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
  const dimensions = snapshot ?? initialDimensions;
  const activeLayer = snapshot?.layers.find((layer) => layer.id === snapshot.activeId);
  const layerPixels = sizeMode === 'layer' ? activeLayer?.pixels : undefined;
  const layerBounds = useMemo(() => (layerPixels ? findInkBounds(layerPixels) : null), [layerPixels]);
  const selectionOverlapsCanvas = Boolean(
    selection &&
      snapshot &&
      selection.x < snapshot.width &&
      selection.y < snapshot.height &&
      selection.x + selection.width > 0 &&
      selection.y + selection.height > 0,
  );
  const isDirty = Boolean(snapshot && snapshot !== savedSnapshot);
  const isBusy = isDrawing || isSaving || isImporting || Boolean(transform);
  const width = dimensions?.width;
  const height = dimensions?.height;
  const imageDimensions = useMemo(() => (width && height ? { width, height } : null), [width, height]);

  const getFitZoom = useCallback(() => {
    if (!imageDimensions || !viewportSize.width || !viewportSize.height) return 1;
    const { width, height } = imageDimensions;
    const nextWidth = Math.max(viewportSize.width - 40, 1);
    const nextHeight = Math.max(viewportSize.height - 64, 1);
    const fit = Math.min(MAX_ZOOM, nextWidth / width, nextHeight / height);
    return fit;
  }, [imageDimensions, viewportSize.height, viewportSize.width]);

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
    if (isSaving || isImporting || confirmingClose.current) return;
    if (dirtyRef.current) {
      confirmingClose.current = true;
      const confirmed = await confirm({
        title: '关闭画板？',
        message: '当前画板还有未保存修改，关闭后这些修改会被丢弃。',
        confirmText: '关闭',
        cancelText: '继续编辑',
        tone: 'danger',
      });
      confirmingClose.current = false;
      if (!confirmed) return;
    }
    onClose();
  }, [confirm, isImporting, isSaving, onClose]);

  useEffect(() => {
    dirtyRef.current = isDirty;
  }, [isDirty]);

  useEffect(() => {
    return () => {
      if (brushPreviewTimerRef.current !== null) window.clearTimeout(brushPreviewTimerRef.current);
    };
  }, []);

  useWorkflowModalIsolation(dialogRef);

  useEffect(() => {
    if (!menuOpen) return;
    const dismiss = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [menuOpen]);

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
    if (width > MAX_IMAGE_SIDE || height > MAX_IMAGE_SIDE || width * height > MAX_CANVAS_PIXELS) {
      setError('源图尺寸超出画板限制，请先缩小图片。');
      return;
    }
    const drawing = createLayer('绘制层', createPixels(1, 1));
    const layers = [drawing];
    if (loadedImage) {
      const original = createPixels(width, height);
      original.getContext('2d')?.drawImage(loadedImage, 0, 0);
      layers.unshift(createLayer('原图', original, true));
    }
    const initial = { width, height, layers, activeId: drawing.id };
    layerCount.current = 0;
    setHistory({ entries: [initial], index: 0 });
    setSavedSnapshot(initial);
    setSelection(null);
  }, [initialDimensions, loadedImage]);

  useLayoutEffect(() => {
    fitViewport();
  }, [fitViewport]);

  useLayoutEffect(() => {
    const canvas = paintCanvasRef.current;
    if (canvas && snapshot) renderDocument(canvas, snapshot, isSketch, transform);
  }, [snapshot, isSketch, transform]);

  const showBrushPreviewTemporarily = useCallback(() => {
    setShowBrushSizePreview(true);
    if (brushPreviewTimerRef.current !== null) window.clearTimeout(brushPreviewTimerRef.current);
    brushPreviewTimerRef.current = window.setTimeout(() => {
      brushPreviewTimerRef.current = null;
      setShowBrushSizePreview(false);
    }, 700);
  }, []);

  function commit(next: CanvasSnapshot) {
    setHistory((current) => {
      const entries = [...current.entries.slice(0, current.index + 1), next].slice(-20);
      const seen = new Set<HTMLCanvasElement>();
      let retainedPixels = 0;
      for (let index = entries.length - 1; index >= 0; index--) {
        for (const { pixels } of entries[index].layers) {
          if (seen.has(pixels)) continue;
          seen.add(pixels);
          retainedPixels += pixels.width * pixels.height;
        }
        if (retainedPixels > HISTORY_PIXEL_BUDGET) {
          entries.splice(0, Math.min(index + 1, entries.length - 1));
          break;
        }
      }
      return { entries, index: entries.length - 1 };
    });
  }

  function updateLayer(patch: Partial<CanvasLayer>, id = activeLayer?.id) {
    if (!snapshot || !id) return;
    commit({
      ...snapshot,
      layers: snapshot.layers.map((layer) => (layer.id === id ? { ...layer, ...patch } : layer)),
    });
  }

  function addLayer(layer: CanvasLayer) {
    if (!snapshot) return;
    const index = snapshot.layers.findIndex((item) => item.id === snapshot.activeId) + 1;
    const layers = [...snapshot.layers];
    layers.splice(index, 0, layer);
    commit({ ...snapshot, layers, activeId: layer.id });
  }

  function reorderLayer(direction: number) {
    if (!snapshot || !activeLayer) return;
    const index = snapshot.layers.indexOf(activeLayer);
    const layers = [...snapshot.layers];
    if (!layers[index + direction]) return;
    layers.splice(index, 1);
    layers.splice(index + direction, 0, activeLayer);
    commit({ ...snapshot, layers });
  }

  function deleteLayer() {
    if (!snapshot || !activeLayer || activeLayer.locked || snapshot.layers.length < 2) return;
    const index = snapshot.layers.indexOf(activeLayer);
    const layers = snapshot.layers.filter((layer) => layer.id !== activeLayer.id);
    commit({ ...snapshot, layers, activeId: layers[Math.max(0, index - 1)].id });
  }

  function duplicateLayer() {
    if (!activeLayer) return;
    const marquee = selection;
    if (!marquee) {
      addLayer({ ...activeLayer, id: crypto.randomUUID(), name: `${activeLayer.name}副本`, locked: false });
      return;
    }
    const { x, y, width, height } = marquee;
    if (width > MAX_IMAGE_SIDE || height > MAX_IMAGE_SIDE || width * height > MAX_CANVAS_PIXELS) {
      setError('选区尺寸过大，请缩小选区后再复制。');
      return;
    }
    const pixels = createPixels(width, height);
    const context = pixels.getContext('2d');
    if (context) {
      context.drawImage(activeLayer.pixels, activeLayer.x - x, activeLayer.y - y);
      maskSelection(context, marquee, x, y);
    }
    addLayer({ ...createLayer('选区副本', pixels), x, y, opacity: activeLayer.opacity, blend: activeLayer.blend });
  }

  async function importLayer(file?: File) {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setIsImporting(true);
    setError('');
    try {
      const image = await loadWorkflowImage(url);
      if (
        image.width > MAX_IMAGE_SIDE ||
        image.height > MAX_IMAGE_SIDE ||
        image.width * image.height > MAX_CANVAS_PIXELS
      ) {
        throw new Error('图片尺寸超出画板限制。');
      }
      const pixels = createPixels(image.width, image.height);
      pixels.getContext('2d')?.drawImage(image, 0, 0);
      addLayer(createLayer(file.name, pixels));
    } catch (error) {
      setError(error instanceof Error ? error.message : '无法导入图片。');
    } finally {
      URL.revokeObjectURL(url);
      setIsImporting(false);
    }
  }

  const beginPan = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
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

  const updatePan = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (panPointerIdRef.current !== event.pointerId || !panStartRef.current) return;
    setPan({
      x: panStartRef.current.originX + (event.clientX - panStartRef.current.x),
      y: panStartRef.current.originY + (event.clientY - panStartRef.current.y),
    });
  }, []);

  const endPan = useCallback((event?: ReactPointerEvent<HTMLDivElement>) => {
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
    const document = strokeDocument.current;
    const layer = document?.layers.find((item) => item.id === document.activeId);
    const context = (maskedStroke.current ?? layer?.pixels)?.getContext('2d');
    if (!context || !layer) return;

    const left = Math.min(start.x - start.radius, control.x - control.radius, end.x - end.radius);
    const right = Math.max(start.x + start.radius, control.x + control.radius, end.x + end.radius);
    const top = Math.min(start.y - start.radius, control.y - control.radius, end.y - end.radius);
    const bottom = Math.max(start.y + start.radius, control.y + control.radius, end.y + end.radius);
    if (
      right <= layer.x ||
      bottom <= layer.y ||
      left >= layer.x + layer.pixels.width ||
      top >= layer.y + layer.pixels.height
    )
      return;
    if (strokeRef.current) strokeRef.current.touchesLayer = true;
    context.save();
    context.translate(-layer.x, -layer.y);
    if (selection && selection.shape !== 'mask') {
      traceMarquee(context, selection);
      context.clip();
    }
    context.globalCompositeOperation = tool === 'eraser' && !maskedStroke.current ? 'destination-out' : 'source-over';
    context.fillStyle = paintColor;
    if (start.radius === control.radius && control.radius === end.radius && (start.x !== end.x || start.y !== end.y)) {
      context.lineWidth = start.radius * 2;
      context.lineCap = 'round';
      context.strokeStyle = paintColor;
      context.beginPath();
      context.moveTo(start.x, start.y);
      context.quadraticCurveTo(control.x, control.y, end.x, end.y);
      context.stroke();
      context.restore();
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
    context.restore();
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
      if (!imageDimensions || isDrawing || transformDrag.current || panPointerIdRef.current !== null) return;
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
    [clampZoom, imageDimensions, isDrawing],
  );

  function finishDrawing(event: ReactPointerEvent<HTMLDivElement>, includeEndpoint = false) {
    const stroke = strokeRef.current;
    if (!stroke || stroke.pointerId !== event.pointerId) return;

    if (!includeEndpoint) {
      maskedStroke.current = null;
      maskedPreview.current = null;
      strokeRef.current = null;
      strokeDocument.current = null;
      setIsDrawing(false);
      if (snapshot && paintCanvasRef.current) renderDocument(paintCanvasRef.current, snapshot, isSketch);
      return;
    }
    {
      const canvas = paintCanvasRef.current;
      const rect = canvas?.getBoundingClientRect();
      if (canvas && rect?.width && rect.height) {
        const endpoint = getBrushPoint(event.nativeEvent, rect, canvas);
        if (endpoint.x !== stroke.last.x || endpoint.y !== stroke.last.y) {
          appendBrushPoint(stroke, { ...endpoint, radius: stroke.last.radius });
        }
      }
    }
    paintCurve(stroke.midpoint, stroke.last, stroke.last);
    strokeRef.current = null;
    setIsDrawing(false);
    if (stroke.touchesLayer && strokeDocument.current) {
      compositeMaskedStroke();
      commit(strokeDocument.current);
    }
    maskedStroke.current = null;
    maskedPreview.current = null;
    strokeDocument.current = null;
  }

  function compositeMaskedStroke() {
    const next = strokeDocument.current;
    const layer = next?.layers.find((item) => item.id === next.activeId);
    const stroke = maskedStroke.current;
    const preview = maskedPreview.current;
    if (!layer || !activeLayer || !selection || !stroke || !preview) return;
    const overlay = preview.getContext('2d')!;
    overlay.clearRect(0, 0, preview.width, preview.height);
    overlay.drawImage(stroke, 0, 0);
    maskSelection(overlay, selection, layer.x, layer.y);
    const context = layer.pixels.getContext('2d')!;
    context.clearRect(0, 0, layer.pixels.width, layer.pixels.height);
    context.drawImage(activeLayer.pixels, activeLayer.x - layer.x, activeLayer.y - layer.y);
    context.save();
    context.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
    context.drawImage(preview, 0, 0);
    context.restore();
  }

  function renderStroke() {
    if (paintCanvasRef.current && strokeDocument.current) {
      compositeMaskedStroke();
      renderDocument(paintCanvasRef.current, strokeDocument.current, isSketch);
    }
  }

  function startStroke() {
    if (!snapshot || !activeLayer || activeLayer.locked || !activeLayer.visible) return false;
    // Include both the layer's existing pixels and the visible canvas in its new drawing surface.
    const x = Math.min(0, activeLayer.x);
    const y = Math.min(0, activeLayer.y);
    const width = Math.max(snapshot.width, activeLayer.x + activeLayer.pixels.width) - x;
    const height = Math.max(snapshot.height, activeLayer.y + activeLayer.pixels.height) - y;
    if (width > MAX_IMAGE_SIDE || height > MAX_IMAGE_SIDE || width * height > MAX_CANVAS_PIXELS) {
      setError('图层和画布的范围过大，请先调整图层位置或缩小画布。');
      return false;
    }
    const pixels = createPixels(width, height);
    pixels.getContext('2d')?.drawImage(activeLayer.pixels, activeLayer.x - x, activeLayer.y - y);
    strokeDocument.current = {
      ...snapshot,
      layers: snapshot.layers.map((layer) => (layer.id === activeLayer.id ? { ...layer, pixels, x, y } : layer)),
    };
    setError('');
    return true;
  }

  function fillLayer(start?: CanvasPoint, end?: CanvasPoint) {
    if (!snapshot || (start && end && Math.hypot(end.x - start.x, end.y - start.y) < 1) || !startStroke()) return;
    const next = strokeDocument.current;
    strokeDocument.current = null;
    const layer = next?.layers.find((item) => item.id === next.activeId);
    if (!next || !layer) return;
    const overlay = selection?.shape === 'mask' ? createPixels(snapshot.width, snapshot.height) : null;
    const context = (overlay ?? layer.pixels).getContext('2d');
    if (!context) return;
    context.save();
    if (!overlay) context.translate(-layer.x, -layer.y);
    if (selection && selection.shape !== 'mask') {
      traceMarquee(context, selection);
      context.clip();
    }
    if (start && end) {
      const gradient = context.createLinearGradient(start.x, start.y, end.x, end.y);
      gradient.addColorStop(0, paintColor);
      gradient.addColorStop(1, gradientEndColor);
      context.fillStyle = gradient;
    } else {
      context.fillStyle = paintColor;
    }
    context.fillRect(0, 0, snapshot.width, snapshot.height);
    context.restore();
    if (overlay && selection) {
      maskSelection(context, selection, 0, 0);
      layer.pixels.getContext('2d')?.drawImage(overlay, -layer.x, -layer.y);
    }
    commit(next);
  }

  function finishGradient(event?: ReactPointerEvent<HTMLDivElement>, apply = false) {
    const drag = gradientDrag.current;
    if (!drag || (event && event.pointerId !== drag.pointerId)) return false;
    gradientDrag.current = null;
    setGradientGuide(null);
    setIsDrawing(false);
    const canvas = paintCanvasRef.current;
    if (apply && event && canvas) {
      fillLayer(drag.start, getBrushPoint(event.nativeEvent, canvas.getBoundingClientRect(), canvas));
    }
    return true;
  }

  function clearLayer() {
    if (!activeLayer || activeLayer.locked || !activeLayer.visible) return;
    const { pixels: source, x, y } = activeLayer;
    const marquee = selection;
    const pixels = marquee ? createPixels(source.width, source.height) : createPixels(1, 1);
    if (marquee) {
      const context = pixels.getContext('2d');
      if (context) {
        context.drawImage(source, 0, 0);
        context.globalCompositeOperation = 'destination-out';
        if (marquee.shape === 'mask') context.drawImage(marquee.pixels, marquee.x - x, marquee.y - y);
        else {
          context.translate(-x, -y);
          traceMarquee(context, marquee);
          context.fill();
        }
      }
    }
    updateLayer({ pixels });
  }

  function resizeCanvas({ width, height }: CanvasDimensions, anchorX: number, anchorY: number) {
    if (!snapshot || (snapshot.width === width && snapshot.height === height)) return;
    const offsetX = Math.round((width - snapshot.width) * anchorX);
    const offsetY = Math.round((height - snapshot.height) * anchorY);
    const layers = snapshot.layers.map((layer) => ({ ...layer, x: layer.x + offsetX, y: layer.y + offsetY }));
    setSelection(null);
    setCursorPoint(null);
    commit({ ...snapshot, width, height, layers });
  }

  function resizeImage({ width, height }: CanvasDimensions) {
    if (!snapshot || (snapshot.width === width && snapshot.height === height)) return;
    const scaleX = width / snapshot.width;
    const scaleY = height / snapshot.height;
    const resized = snapshot.layers.map((layer) => {
      const x = Math.round(layer.x * scaleX);
      const y = Math.round(layer.y * scaleY);
      return {
        layer,
        x,
        y,
        width: Math.max(1, Math.round((layer.x + layer.pixels.width) * scaleX) - x),
        height: Math.max(1, Math.round((layer.y + layer.pixels.height) * scaleY) - y),
      };
    });
    if (
      resized.some(
        (layer) =>
          layer.width > MAX_IMAGE_SIDE ||
          layer.height > MAX_IMAGE_SIDE ||
          layer.width * layer.height > MAX_CANVAS_PIXELS,
      )
    ) {
      setError('缩放后的图层超出尺寸限制，请减小图像大小。');
      return;
    }
    const layers = resized.map(({ layer, x, y, width, height }) => {
      if (width === layer.pixels.width && height === layer.pixels.height) return { ...layer, x, y };
      const pixels = createPixels(width, height);
      pixels.getContext('2d')?.drawImage(layer.pixels, 0, 0, width, height);
      return { ...layer, pixels, x, y };
    });
    setError('');
    setSelection(null);
    setCursorPoint(null);
    commit({ ...snapshot, width, height, layers });
  }

  function resizeActiveLayer({ width, height }: CanvasDimensions) {
    if (!activeLayer || activeLayer.locked || !layerBounds) return;
    const pixels = createPixels(width, height);
    pixels
      .getContext('2d')
      ?.drawImage(
        activeLayer.pixels,
        layerBounds.x,
        layerBounds.y,
        layerBounds.width,
        layerBounds.height,
        0,
        0,
        width,
        height,
      );
    setError('');
    updateLayer({ pixels, x: activeLayer.x + layerBounds.x, y: activeLayer.y + layerBounds.y });
  }

  function cropToSelection() {
    if (!snapshot || !selection) return;
    const x = Math.max(0, selection.x);
    const y = Math.max(0, selection.y);
    const width = Math.min(snapshot.width, selection.x + selection.width) - x;
    const height = Math.min(snapshot.height, selection.y + selection.height) - y;
    if (width <= 0 || height <= 0) return;
    const layers = snapshot.layers.map((layer) => ({ ...layer, x: layer.x - x, y: layer.y - y }));
    commit({ ...snapshot, width, height, layers });
    setSelection(null);
  }

  function updateSelection(event: ReactPointerEvent<HTMLDivElement>, finalize = false) {
    const start = selectionStart.current;
    if (!start || start.pointerId !== event.pointerId) return false;
    const canvas = paintCanvasRef.current;
    if (!canvas) return false;
    const point = getBrushPoint(event.nativeEvent, canvas.getBoundingClientRect(), canvas);
    const endX = Math.round(point.x);
    const endY = Math.round(point.y);
    if (start.move && start.previous) {
      const previous = start.previous;
      setSelection({
        ...previous,
        x: previous.x + endX - start.x,
        y: previous.y + endY - start.y,
      });
      return true;
    }
    let candidate: Marquee | null;
    if (start.points) {
      const last = start.points.at(-1);
      if (last?.x !== endX || last.y !== endY) start.points.push({ x: endX, y: endY });
      candidate = lassoMarquee(start.points);
    } else {
      let dx = endX - start.x;
      let dy = endY - start.y;
      if (event.shiftKey) {
        const size = Math.min(Math.abs(dx), Math.abs(dy));
        dx = Math.sign(dx) * size;
        dy = Math.sign(dy) * size;
      }
      const width = Math.abs(dx);
      const height = Math.abs(dy);
      candidate =
        width && height
          ? {
              x: start.x + Math.min(0, dx),
              y: start.y + Math.min(0, dy),
              width,
              height,
              shape: marqueeShape === 'ellipse' ? 'ellipse' : 'rectangle',
            }
          : null;
    }
    if (finalize) {
      const previous = start.previous;
      if (!candidate) {
        setSelection(start.mode === 'replace' ? null : previous);
        return true;
      }
      const padding = feather * 2;
      const left = candidate.x - padding;
      const top = candidate.y - padding;
      const right = candidate.x + candidate.width + padding;
      const bottom = candidate.y + candidate.height + padding;
      const width =
        previous && start.mode === 'add'
          ? Math.max(right, previous.x + previous.width) - Math.min(left, previous.x)
          : right - left;
      const height =
        previous && start.mode === 'add'
          ? Math.max(bottom, previous.y + previous.height) - Math.min(top, previous.y)
          : bottom - top;
      if (
        (feather || start.mode !== 'replace') &&
        (width > MAX_IMAGE_SIDE || height > MAX_IMAGE_SIDE || width * height > MAX_CANVAS_PIXELS)
      ) {
        setError('选区尺寸过大，请缩小选区或减少羽化。');
        setSelection(previous);
        return true;
      }
      setError('');
      const next = makeSelectionMask(candidate, feather);
      if (previous && next && start.mode !== 'replace') candidate = combineSelection(previous, next, start.mode);
      else candidate = next;
    }
    setSelection(candidate);
    return true;
  }

  function finishSelection(event: ReactPointerEvent<HTMLDivElement>, apply: boolean) {
    if (selectionStart.current?.pointerId !== event.pointerId) return false;
    if (apply) updateSelection(event, true);
    else setSelection(selectionStart.current.previous);
    selectionStart.current = null;
    setIsDrawing(false);
    return true;
  }

  function activateLayer(activeId: string) {
    if (!snapshot || snapshot.activeId === activeId || isBusy) return;
    const next = { ...snapshot, activeId };
    setHistory((current) => ({
      ...current,
      entries: current.entries.map((entry, index) => (index === current.index ? next : entry)),
    }));
    if (snapshot === savedSnapshot) setSavedSnapshot(next);
  }

  function dropLayer(id: string, above: boolean) {
    if (!snapshot || !draggedLayer || id === draggedLayer || isBusy) return;
    const source = snapshot.layers.find((layer) => layer.id === draggedLayer);
    if (!source) return;
    const layers = snapshot.layers.filter((layer) => layer !== source);
    const index = layers.findIndex((layer) => layer.id === id);
    layers.splice(index + Number(above), 0, source);
    if (layers.some((layer, i) => layer !== snapshot.layers[i])) commit({ ...snapshot, layers });
  }

  function selectTool(next: ToolMode, shape?: Exclude<Marquee['shape'], 'mask'>) {
    setTool(next);
    setViewMode('draw');
    if (shape) setMarqueeShape(shape);
  }

  function beginTransform() {
    if (isBusy || !activeLayer?.visible || activeLayer.locked) return;
    const bounds = findInkBounds(activeLayer.pixels);
    if (!bounds) {
      setError('当前图层没有可变换的像素。');
      return;
    }
    const source = createPixels(bounds.width, bounds.height);
    source.getContext('2d')?.drawImage(activeLayer.pixels, -bounds.x, -bounds.y);
    const frame = { ...bounds, x: bounds.x + activeLayer.x, y: bounds.y + activeLayer.y, angle: 0 };
    setViewMode('draw');
    setError('');
    setTransform({ source, initial: frame, frame });
    paintCanvasRef.current?.focus({ preventScroll: true });
  }

  function editTransform(frame: CanvasTransform) {
    setTransform((current) => current && { ...current, frame });
  }

  function endTransform(apply: boolean) {
    if (!transform) return;
    if (apply && transformDrag.current) return;
    if (
      apply &&
      (Object.keys(transform.frame) as (keyof CanvasTransform)[]).some(
        (key) => Math.abs(transform.frame[key] - transform.initial[key]) > 1e-6,
      )
    ) {
      const { x, y, width, height } = transformBounds(transform.frame);
      if (width > MAX_IMAGE_SIDE || height > MAX_IMAGE_SIDE || width * height > MAX_CANVAS_PIXELS) {
        setError('变换后的图层超出尺寸限制，请缩小后再应用。');
        return;
      }
      const pixels = createPixels(width, height);
      const context = pixels.getContext('2d');
      if (!context) return;
      drawTransformed(context, transform.source, {
        ...transform.frame,
        x: transform.frame.x - x,
        y: transform.frame.y - y,
      });
      updateLayer({ pixels, x, y });
    }
    transformDrag.current = null;
    setTransform(null);
    setError('');
  }

  function transformPoint(event: ReactPointerEvent) {
    const canvas = paintCanvasRef.current;
    return canvas ? getBrushPoint(event.nativeEvent, canvas.getBoundingClientRect(), canvas) : { x: 0, y: 0 };
  }

  function updateTransformDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = transformDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    editTransform(dragTransform(drag.frame, drag.handle, drag.point, transformPoint(event), event.shiftKey));
  }

  function finishTransformDrag(event: ReactPointerEvent<HTMLDivElement>, apply: boolean) {
    const drag = transformDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (apply) updateTransformDrag(event);
    else editTransform(drag.frame);
    transformDrag.current = null;
  }

  function stepHistory(direction: number) {
    setSelection(null);
    setHistory((current) => {
      const index = current.index + direction;
      return index >= 0 && index < current.entries.length ? { ...current, index } : current;
    });
  }

  function handleCanvasKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    isolateWorkflowModalKey(event);
    const target = event.target as HTMLElement | null;
    if (event.defaultPrevented || event.nativeEvent.isComposing || confirmingClose.current) return;
    if (target?.matches('input, textarea, select, [contenteditable="true"]')) return;
    const key = event.key.toLowerCase();
    const modifier = event.ctrlKey || event.metaKey;
    if (event.code === 'Space' && !modifier && target?.tagName !== 'BUTTON' && !transform && !isBusy) {
      event.preventDefault();
      setHoldPan(true);
      return;
    }
    if (key === 'escape') {
      if (finishGradient()) {
        event.preventDefault();
        return;
      }
      if (isDrawing || isSaving || isImporting) return;
      event.preventDefault();
      if (transform) endTransform(false);
      else if (menuOpen) setMenuOpen(false);
      else if (selection) setSelection(null);
      else void handleClose();
      return;
    }
    if (transform && key === 'enter' && target?.tagName !== 'BUTTON') {
      event.preventDefault();
      endTransform(true);
      return;
    }
    if (isBusy || !snapshot) return;
    if (modifier && ['z', 'y', 'a', 'd', 'j', 't'].includes(key)) {
      event.preventDefault();
      if (key === 'z' || key === 'y') stepHistory(key === 'z' && !event.shiftKey ? -1 : 1);
      if (key === 'a') setSelection({ x: 0, y: 0, width: snapshot.width, height: snapshot.height, shape: 'rectangle' });
      if (key === 'd') setSelection(null);
      if (key === 'j') duplicateLayer();
      if (key === 't') beginTransform();
    } else if (!modifier && !event.altKey) {
      if (key === 'b') selectTool('brush');
      if (key === 'e') selectTool('eraser');
      if (key === 'm') selectTool('selection', event.shiftKey ? 'ellipse' : 'rectangle');
      if (key === 'g') selectTool(event.shiftKey ? 'fill' : 'gradient');
      if (key === 'l') selectTool('selection', 'lasso');
      if (key === 'h') setViewMode('pan');
      if ((key === 'delete' || key === 'backspace') && selection) {
        event.preventDefault();
        clearLayer();
      }
    }
  }

  useEffect(() => {
    const blur = () => setHoldPan(false);
    window.addEventListener('blur', blur);
    return () => window.removeEventListener('blur', blur);
  }, []);

  const exportCanvasToFile = useCallback(async () => {
    const canvas = paintCanvasRef.current;
    if (!canvas) throw new Error('无法导出当前绘制结果，请稍后重试。');
    return encodeCanvasPng(canvas, isSketch ? 'sketch.png' : 'painted-image.png');
  }, [isSketch]);

  async function exportActiveLayer(trim = false) {
    if (!snapshot || !activeLayer || !onExportLayer || isBusy) return;
    setMenuOpen(false);
    setIsSaving(true);
    setExportMessage('');
    setError('');
    try {
      const bounds = trim
        ? findInkBounds(activeLayer.pixels)
        : { x: 0, y: 0, width: snapshot.width, height: snapshot.height };
      if (!bounds || (trim && !activeLayer.opacity)) throw new Error('当前图层没有可导出的像素。');
      const pixels = createPixels(bounds.width, bounds.height);
      const context = pixels.getContext('2d');
      if (!context) throw new Error('无法读取图层。');
      context.globalAlpha = activeLayer.opacity;
      context.drawImage(activeLayer.pixels, trim ? -bounds.x : activeLayer.x, trim ? -bounds.y : activeLayer.y);
      let output = pixels;
      if (trim && activeLayer.opacity < 1) {
        const actual = findInkBounds(pixels);
        if (!actual) throw new Error('当前图层没有可导出的像素。');
        if (actual.width !== pixels.width || actual.height !== pixels.height) {
          output = createPixels(actual.width, actual.height);
          output.getContext('2d')?.drawImage(pixels, -actual.x, -actual.y);
        }
      }
      const name = activeLayer.name.replace(/[\\/:*?"<>|]/g, '_').trim() || '图层';
      await onExportLayer(await encodeCanvasPng(output, `${name}.png`));
      setExportMessage('图层已添加到当前 IO 节点');
    } catch (error) {
      setError(error instanceof Error ? error.message : '图层导出失败，请重试。');
    } finally {
      setIsSaving(false);
    }
  }

  const save = useCallback(
    async (closeAfterSave: boolean) => {
      try {
        setIsSaving(true);
        setError('');
        const file = await exportCanvasToFile();
        await onSavePaint(file);
        setSavedSnapshot(snapshot);
        dirtyRef.current = false;
        if (closeAfterSave) onClose();
      } catch (nextError) {
        setError(formatCanvasEditorError(nextError instanceof Error ? nextError.message : ''));
      } finally {
        setIsSaving(false);
      }
    },
    [exportCanvasToFile, onClose, onSavePaint, snapshot],
  );

  const handleBrushSizeChange = useCallback(
    (nextSize: number) => {
      setBrushSize(nextSize);
      showBrushPreviewTemporarily();
    },
    [showBrushPreviewTemporarily],
  );

  const isCanvasEditorAvailable = Boolean(snapshot);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <ModalSurface
      ariaLabel={nodeLabel}
      onClose={() => void handleClose()}
      rootClassName="settings-modal node-canvas-editor-modal"
      panelClassName="settings-modal__panel node-canvas-editor-modal__dialog"
      backdropClassName="settings-modal__backdrop"
      panelRef={dialogRef}
      manageFocus={false}
      closeOnEscape={false}
      dialogOnPanel
      rootProps={{
        ...workflowModalPointerBoundary,
        'data-workflow-modal-overlay': '',
        onClick: stopWorkflowModalEvent,
        onMouseDown: stopWorkflowModalEvent,
      }}
      panelProps={{
        onKeyPress: stopWorkflowModalEvent,
        onPaste: stopWorkflowModalEvent,

        onKeyDown: handleCanvasKeyDown,
        onKeyUp: (event) => {
          event.stopPropagation();
          if (event.code === 'Space') setHoldPan(false);
        },
        onBlur: (event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setHoldPan(false);
        },
      }}
    >
      <div className="node-canvas-editor-modal__header">
        <div className="workflow-toolbar__badge">
          <NotePencil size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="node-canvas-editor-modal__eyebrow">图像编辑</div>
          <div className="node-canvas-editor-modal__title">{nodeLabel}</div>
        </div>
        <button
          type="button"
          onClick={() => (transform ? endTransform(false) : void handleClose())}
          className="node-canvas-editor-modal__icon-button"
          aria-label="关闭画板"
        >
          <X size={16} />
        </button>
      </div>

      <div className="canvas-options" aria-label="工具选项">
        {transform ? (
          <>
            <strong>自由变换</strong>
            {(
              [
                ['x', 'X', -MAX_IMAGE_SIDE, MAX_IMAGE_SIDE],
                ['y', 'Y', -MAX_IMAGE_SIDE, MAX_IMAGE_SIDE],
                ['width', '宽', 1, MAX_IMAGE_SIDE],
                ['height', '高', 1, MAX_IMAGE_SIDE],
                ['angle', '角度', -360, 360],
              ] as const
            ).map(([key, label, min, max]) => (
              <label key={key}>
                {label}
                <CommitNumber
                  value={Math.round(
                    key === 'angle' ? ((transform.frame.angle * 180) / Math.PI) % 360 : transform.frame[key],
                  )}
                  min={min}
                  max={max}
                  onCommit={(value) =>
                    editTransform({ ...transform.frame, [key]: key === 'angle' ? (value * Math.PI) / 180 : value })
                  }
                />
              </label>
            ))}
            <button type="button" onClick={() => endTransform(false)}>
              取消变换
            </button>
            <button type="button" className="canvas-options__apply" onClick={() => endTransform(true)}>
              <Check size={15} /> 应用变换
            </button>
          </>
        ) : (
          <>
            {tool !== 'selection' && viewMode === 'draw' && (
              <>
                {isBrushTool && (
                  <label className="node-canvas-editor-modal__slider">
                    <span>笔刷 {brushSize}px</span>
                    <input
                      type="range"
                      min={4}
                      max={96}
                      step={2}
                      disabled={isBusy}
                      value={brushSize}
                      style={{ '--range-progress': `${((brushSize - 4) / 92) * 100}%` } as CSSProperties}
                      onChange={(event) => handleBrushSizeChange(Number(event.target.value))}
                    />
                  </label>
                )}

                <label className="node-canvas-editor-modal__color-picker">
                  <span>{tool === 'gradient' ? '起始颜色' : '颜色'}</span>
                  <span
                    className="node-canvas-editor-modal__color-swatch"
                    style={{ '--paint-color': paintColor } as CSSProperties}
                  >
                    <input
                      type="color"
                      disabled={isBusy}
                      value={paintColor}
                      onChange={(event) => setPaintColor(event.target.value)}
                    />
                  </span>
                </label>
                {tool === 'gradient' && (
                  <label className="node-canvas-editor-modal__color-picker">
                    <span>结束颜色</span>
                    <span
                      className="node-canvas-editor-modal__color-swatch"
                      style={{ '--paint-color': gradientEndColor } as CSSProperties}
                    >
                      <input
                        type="color"
                        disabled={isBusy}
                        value={gradientEndColor}
                        onChange={(event) => setGradientEndColor(event.target.value)}
                      />
                    </span>
                  </label>
                )}
                {tool === 'fill' && (
                  <button
                    type="button"
                    disabled={isBusy || !activeLayer?.visible || activeLayer.locked}
                    onClick={() => fillLayer()}
                  >
                    {selection ? '填充选区' : '填充画布'}
                  </button>
                )}
                {tool === 'gradient' && <span>拖拽设定渐变方向和长度</span>}
              </>
            )}
            {viewMode === 'pan' && <span>拖动画布以平移视图</span>}
            {tool === 'selection' && viewMode === 'draw' && (
              <>
                <label>
                  选区模式
                  <select
                    value={selectionMode}
                    disabled={isBusy}
                    onChange={(event) => setSelectionMode(event.target.value as SelectionMode)}
                  >
                    <option value="replace">新建</option>
                    <option value="add">添加</option>
                    <option value="subtract">减去</option>
                    <option value="intersect">相交</option>
                  </select>
                </label>
                <label>
                  羽化 (px)
                  <CommitNumber value={feather} min={0} max={256} disabled={isBusy} onCommit={setFeather} />
                </label>
              </>
            )}
            {tool === 'selection' && !selection && viewMode === 'draw' && (
              <span>
                {marqueeShape === 'lasso' ? '按住鼠标勾勒轮廓，松开闭合' : '拖出选区 · Shift 等比 · Ctrl / ⌘ A 全选'}
              </span>
            )}
            {selection && (
              <>
                <span className="canvas-selection-info">
                  {selection.shape === 'mask'
                    ? '选区'
                    : selection.shape === 'lasso'
                      ? '套索'
                      : selection.shape === 'ellipse'
                        ? '椭圆'
                        : '矩形'}{' '}
                  · {selection.width} × {selection.height} px
                </span>
                <button type="button" disabled={isBusy} onClick={duplicateLayer}>
                  <Copy size={14} /> 复制选区
                </button>
                <button
                  type="button"
                  disabled={isBusy || !activeLayer?.visible || activeLayer.locked}
                  onClick={clearLayer}
                >
                  清除像素
                </button>
                <button type="button" disabled={isBusy || !selectionOverlapsCanvas} onClick={cropToSelection}>
                  裁切画布
                </button>
                <button type="button" disabled={isBusy} onClick={() => setSelection(null)}>
                  取消选区
                </button>
              </>
            )}
          </>
        )}
      </div>

      <div className="canvas-workspace">
        <nav className="canvas-tools" aria-label="画板工具">
          {(
            [
              ['画笔', 'B', NotePencil, tool === 'brush', () => selectTool('brush')],
              ['橡皮', 'E', Eraser, tool === 'eraser', () => selectTool('eraser')],
              ['纯色填充', 'Shift + G', PaintBucket, tool === 'fill', () => selectTool('fill')],
              ['渐变填充', 'G', Gradient, tool === 'gradient', () => selectTool('gradient')],
              [
                '矩形选区',
                'M',
                Selection,
                tool === 'selection' && marqueeShape === 'rectangle',
                () => selectTool('selection', 'rectangle'),
              ],
              [
                '椭圆选区',
                'Shift + M',
                CircleDashed,
                tool === 'selection' && marqueeShape === 'ellipse',
                () => selectTool('selection', 'ellipse'),
              ],
              [
                '套索选区',
                'L',
                Lasso,
                tool === 'selection' && marqueeShape === 'lasso',
                () => selectTool('selection', 'lasso'),
              ],
              ['平移', 'H / 空格', Hand, viewMode === 'pan', () => setViewMode(viewMode === 'pan' ? 'draw' : 'pan')],
              ['自由变换', 'Ctrl / ⌘ T', BoundingBox, Boolean(transform), beginTransform],
            ] as const
          ).map(([label, shortcut, Icon, pressed, action]) => (
            <button
              key={label}
              type="button"
              className="canvas-icon"
              title={`${label} (${shortcut})`}
              aria-label={label}
              aria-pressed={
                pressed && (label === '平移' || label === '自由变换' || (!transform && viewMode === 'draw'))
              }
              disabled={isBusy || !snapshot || (label === '自由变换' && (!activeLayer?.visible || activeLayer.locked))}
              onClick={action}
            >
              <Icon size={19} />
            </button>
          ))}
          <div className="canvas-tools__separator" />
          <button
            type="button"
            className="canvas-icon"
            title="撤销 (Ctrl / ⌘ Z)"
            aria-label="撤销"
            disabled={isBusy || history.index <= 0}
            onClick={() => stepHistory(-1)}
          >
            <ArrowCounterClockwise size={18} />
          </button>
          <button
            type="button"
            className="canvas-icon"
            title="重做 (Ctrl / ⌘ Shift Z)"
            aria-label="重做"
            disabled={isBusy || history.index >= history.entries.length - 1}
            onClick={() => stepHistory(1)}
          >
            <ArrowClockwise size={18} />
          </button>
        </nav>
        <div className="canvas-stage">
          <div className="canvas-stage__bar">
            <span>{imageDimensions ? `${imageDimensions.width} × ${imageDimensions.height} px` : '画布'}</span>
            <div>
              <button
                type="button"
                aria-label="缩小"
                title="缩小"
                disabled={isDrawing}
                onClick={() => setZoom((current) => clampZoom(current - 0.15))}
              >
                −
              </button>
              <button
                type="button"
                title="重置为 100%"
                aria-label="重置视图"
                disabled={isDrawing}
                onClick={resetViewport}
              >
                {Math.round(zoom * 100)}%
              </button>
              <button
                type="button"
                aria-label="放大"
                title="放大"
                disabled={isDrawing}
                onClick={() => setZoom((current) => clampZoom(current + 0.15))}
              >
                +
              </button>
              <button type="button" disabled={isDrawing} onClick={fitViewport}>
                适合视图
              </button>
            </div>
          </div>
          <div
            ref={viewportRef}
            className={`node-canvas-editor-modal__viewport${isCanvasEditorAvailable && (viewMode === 'pan' || holdPan) ? ' canvas-document--pan' : ''}${isCanvasEditorAvailable && !holdPan && !transform && viewMode === 'draw' ? (isBrushTool ? ' canvas-viewport--brush' : ' canvas-document--selecting') : ''}`}
            onWheel={handleViewportWheel}
            onPointerDown={(event) => {
              if (
                !paintCanvasRef.current ||
                isDrawing ||
                isSaving ||
                isImporting ||
                strokeRef.current ||
                selectionStart.current ||
                panPointerIdRef.current !== null
              )
                return;
              const shouldPan = event.button === 1 || (event.button === 0 && (viewMode === 'pan' || holdPan));
              if (shouldPan) {
                event.preventDefault();
                beginPan(event);
                return;
              }
              if (event.button !== 0 || transform) return;
              const canvas = paintCanvasRef.current;
              if (!canvas) return;
              const rect = canvas.getBoundingClientRect();
              if (!rect.width || !rect.height) return;
              event.preventDefault();
              canvas.focus({ preventScroll: true });
              const point = getBrushPoint(event.nativeEvent, rect, canvas);
              if (tool === 'selection') {
                const nx = selection ? (point.x - selection.x) / selection.width : -1;
                const ny = selection ? (point.y - selection.y) / selection.height : -1;
                const move = Boolean(
                  selection &&
                    selectionMode === 'replace' &&
                    selection.shape !== 'mask' &&
                    selection.shape !== 'lasso' &&
                    marqueeShape !== 'lasso' &&
                    !event.shiftKey &&
                    (selection.shape === 'ellipse'
                      ? (nx - 0.5) ** 2 + (ny - 0.5) ** 2 <= 0.25
                      : nx >= 0 && nx <= 1 && ny >= 0 && ny <= 1),
                );
                const x = Math.round(point.x);
                const y = Math.round(point.y);
                selectionStart.current = {
                  pointerId: event.pointerId,
                  x,
                  y,
                  points: marqueeShape === 'lasso' ? [{ x, y }] : undefined,
                  previous: selection,
                  mode: selectionMode,
                  move,
                };
                if (!move) setSelection(null);
                setIsDrawing(true);
                event.currentTarget.setPointerCapture(event.pointerId);
                return;
              }
              if (tool === 'fill' || tool === 'gradient') {
                if (!activeLayer?.visible || activeLayer.locked) return;
                if (tool === 'fill') {
                  fillLayer();
                } else {
                  gradientDrag.current = { pointerId: event.pointerId, start: point };
                  setGradientGuide({ start: point, end: point });
                  setIsDrawing(true);
                  event.currentTarget.setPointerCapture(event.pointerId);
                }
                return;
              }
              if (!startStroke()) return;
              if (selection?.shape === 'mask') {
                const document = strokeDocument.current;
                const layer = document?.layers.find((item) => item.id === document.activeId);
                if (layer) {
                  maskedStroke.current = createPixels(layer.pixels.width, layer.pixels.height);
                  maskedPreview.current = createPixels(layer.pixels.width, layer.pixels.height);
                }
              }
              event.currentTarget.setPointerCapture(event.pointerId);
              strokeRef.current = { pointerId: event.pointerId, last: point, midpoint: point, touchesLayer: false };
              setIsDrawing(true);
              setCursorPoint(point);
              paintCurve(point, point, point);
              renderStroke();
            }}
            onPointerMove={(event) => {
              if (panPointerIdRef.current === event.pointerId) {
                updatePan(event);
                return;
              }
              if (updateSelection(event) || selectionStart.current) return;
              if (transform) return;
              const stroke = strokeRef.current;
              if (stroke && stroke.pointerId !== event.pointerId) return;
              const canvas = paintCanvasRef.current;
              if (!canvas) return;
              const rect = canvas.getBoundingClientRect();
              if (!rect.width || !rect.height) return;
              const nativeEvent = event.nativeEvent;
              const drag = gradientDrag.current;
              if (drag) {
                if (drag.pointerId === event.pointerId) {
                  setGradientGuide({ start: drag.start, end: getBrushPoint(nativeEvent, rect, canvas) });
                }
                return;
              }
              if (!isBrushTool) return;
              setCursorPoint(getBrushPoint(nativeEvent, rect, canvas));
              if (!stroke) return;
              const samples = nativeEvent.getCoalescedEvents?.();
              for (const sample of samples?.length ? samples : [nativeEvent]) {
                appendBrushPoint(stroke, getBrushPoint(sample, rect, canvas));
              }
              renderStroke();
            }}
            onPointerUp={(event) => {
              if (panPointerIdRef.current === event.pointerId) endPan(event);
              else if (!finishGradient(event, true) && !finishSelection(event, true)) finishDrawing(event, true);
            }}
            onPointerLeave={() => setCursorPoint(null)}
            onPointerCancel={(event) => {
              if (panPointerIdRef.current === event.pointerId) endPan(event);
              else if (!finishGradient(event) && !finishSelection(event, false)) finishDrawing(event);
            }}
            onLostPointerCapture={(event) => {
              if (panPointerIdRef.current === event.pointerId) endPan();
              else if (!finishGradient(event) && !finishSelection(event, false)) finishDrawing(event);
            }}
          >
            {!isSketch && !src ? (
              <div className="node-canvas-editor-modal__loading">当前没有可编辑的图片。</div>
            ) : isCanvasEditorAvailable ? (
              <div
                className={`node-canvas-editor-modal__canvas-stack canvas-document${viewMode === 'pan' || holdPan ? ' canvas-document--pan' : ''}${transform ? ' canvas-document--transform' : ''}${!isBrushTool && viewMode === 'draw' && !holdPan && !transform ? ' canvas-document--selecting' : ''}`}
                style={canvasStyle}
              >
                {cursorPoint && viewMode === 'draw' && !holdPan && !transform && isBrushTool && (
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
                {showBrushSizePreview && viewMode === 'draw' && !holdPan && !transform && isBrushTool && (
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
                {selection && !transform && <MarqueeOutline selection={selection} zoom={zoom} />}
                {gradientGuide && (
                  <svg className="canvas-gradient-guide" aria-hidden="true">
                    <line
                      x1={gradientGuide.start.x}
                      y1={gradientGuide.start.y}
                      x2={gradientGuide.end.x}
                      y2={gradientGuide.end.y}
                      vectorEffect="non-scaling-stroke"
                    />
                    {[gradientGuide.start, gradientGuide.end].map((point, index) => (
                      <circle key={index} cx={point.x} cy={point.y} r={4 / zoom} vectorEffect="non-scaling-stroke" />
                    ))}
                  </svg>
                )}
                {transform && (
                  <div
                    className="canvas-transform-frame"
                    style={
                      {
                        left: transform.frame.x,
                        top: transform.frame.y,
                        width: transform.frame.width,
                        height: transform.frame.height,
                        transform: `rotate(${transform.frame.angle}rad)`,
                        '--handle-size': `${9 / zoom}px`,
                        '--transform-stroke': `${1 / zoom}px`,
                        '--rotation-offset': `${26 / zoom}px`,
                      } as CSSProperties
                    }
                    onPointerDown={(event) => {
                      if (event.button !== 0 || transformDrag.current) return;
                      event.stopPropagation();
                      const handle = (event.target as HTMLElement).dataset.handle as TransformHandle | undefined;
                      event.preventDefault();
                      transformDrag.current = {
                        pointerId: event.pointerId,
                        handle: handle ?? 'move',
                        point: transformPoint(event),
                        frame: transform.frame,
                      };
                      event.currentTarget.setPointerCapture(event.pointerId);
                    }}
                    onPointerMove={updateTransformDrag}
                    onPointerUp={(event) => finishTransformDrag(event, true)}
                    onPointerCancel={(event) => finishTransformDrag(event, false)}
                    onLostPointerCapture={(event) => finishTransformDrag(event, false)}
                  >
                    {(['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w', 'rotate'] as const).map((handle) => (
                      <span key={handle} data-handle={handle} aria-hidden="true" />
                    ))}
                  </div>
                )}
                <canvas
                  ref={paintCanvasRef}
                  tabIndex={0}
                  aria-label="图像画布"
                  className="node-canvas-editor-modal__canvas is-active"
                />
              </div>
            ) : (
              <div className="node-canvas-editor-modal__loading">{error ? '无法打开源图' : '正在加载源图...'}</div>
            )}
          </div>
        </div>
        {snapshot && activeLayer && imageDimensions && (
          <aside className="canvas-inspector" aria-label="画板面板">
            <section className="canvas-panel">
              <div className="canvas-panel__heading">
                <h3>画布属性</h3>
                <span>{isSketch ? '白色背景' : '透明背景'}</span>
              </div>
              <div className="canvas-size-modes" role="group" aria-label="尺寸类型">
                {(
                  [
                    ['canvas', '画布大小'],
                    ['image', '图像大小'],
                    ['layer', '图层大小'],
                  ] as const
                ).map(([mode, label]) => (
                  <button
                    type="button"
                    key={mode}
                    aria-pressed={sizeMode === mode}
                    disabled={isBusy}
                    onClick={() => setSizeMode(mode)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {sizeMode === 'canvas' ? (
                <CanvasSizeControls
                  key={`canvas-${imageDimensions.width}x${imageDimensions.height}`}
                  dimensions={imageDimensions}
                  disabled={isBusy}
                  isSketch={isSketch}
                  onApply={resizeCanvas}
                />
              ) : sizeMode === 'image' ? (
                <PixelSizeControls
                  key={`image-${imageDimensions.width}x${imageDimensions.height}`}
                  dimensions={imageDimensions}
                  label="图像"
                  maxSide={isSketch ? MAX_SKETCH_SIDE : MAX_IMAGE_SIDE}
                  disabled={isBusy}
                  onApply={resizeImage}
                />
              ) : layerBounds ? (
                <PixelSizeControls
                  key={`${activeLayer.id}-${layerBounds.width}x${layerBounds.height}`}
                  dimensions={layerBounds}
                  label="图层"
                  maxSide={MAX_IMAGE_SIDE}
                  disabled={isBusy || activeLayer.locked}
                  message={activeLayer.locked ? '解锁当前图层后可调整大小。' : undefined}
                  onApply={resizeActiveLayer}
                />
              ) : (
                <p className="canvas-size-hint">当前图层没有可缩放的像素。</p>
              )}
            </section>
            <section className="canvas-panel canvas-panel--layers">
              <div className="canvas-panel__heading">
                <h3>
                  图层 <small>{snapshot.layers.length}</small>
                </h3>
                <div className="canvas-layer-menu" ref={menuRef}>
                  <button
                    type="button"
                    className="canvas-icon"
                    aria-label="图层菜单"
                    title="图层菜单"
                    aria-expanded={menuOpen}
                    disabled={isBusy}
                    onClick={() => setMenuOpen(!menuOpen)}
                  >
                    <DotsThree size={19} weight="bold" />
                  </button>
                  {menuOpen && !isBusy && (
                    <div
                      className="canvas-layer-menu__items"
                      onBlur={(event) => {
                        if (!event.currentTarget.parentElement?.contains(event.relatedTarget)) setMenuOpen(false);
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setMenuOpen(false);
                          beginTransform();
                        }}
                        disabled={!activeLayer.visible || activeLayer.locked}
                      >
                        自由变换 <kbd>Ctrl / ⌘ T</kbd>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setMenuOpen(false);
                          duplicateLayer();
                        }}
                      >
                        {selection ? '选区复制到新图层' : '复制图层'}
                      </button>
                      {onExportLayer && (
                        <>
                          <button type="button" onClick={() => void exportActiveLayer()}>
                            导出图层到当前 IO 节点
                          </button>
                          <button type="button" onClick={() => void exportActiveLayer(true)}>
                            导出图层到当前 IO 节点（裁紧）
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setMenuOpen(false);
                          clearLayer();
                        }}
                        disabled={!activeLayer.visible || activeLayer.locked}
                      >
                        {selection ? '清除选区像素' : '清空图层'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setMenuOpen(false);
                          reorderLayer(1);
                        }}
                        disabled={snapshot.layers.at(-1) === activeLayer}
                      >
                        图层上移
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setMenuOpen(false);
                          reorderLayer(-1);
                        }}
                        disabled={snapshot.layers[0] === activeLayer}
                      >
                        图层下移
                      </button>
                    </div>
                  )}
                </div>
              </div>
              <div className="canvas-layer-properties">
                <label>
                  混合模式
                  <select
                    value={activeLayer.blend}
                    disabled={isBusy || activeLayer.locked}
                    onChange={(event) => updateLayer({ blend: event.target.value as GlobalCompositeOperation })}
                  >
                    {BLEND_MODES.map(([value, name]) => (
                      <option key={value} value={value}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  不透明度
                  <CommitNumber
                    key={activeLayer.id}
                    value={Math.round(activeLayer.opacity * 100)}
                    min={0}
                    max={100}
                    disabled={isBusy || activeLayer.locked}
                    onCommit={(value) => updateLayer({ opacity: value / 100 })}
                  />
                </label>
              </div>
              <ul className="canvas-layer-list" aria-label="图层堆栈">
                {[...snapshot.layers].reverse().map((layer) => (
                  <li
                    key={layer.id}
                    className={layer.id === activeLayer.id ? 'is-current' : ''}
                    data-drop={layerDrop?.id === layer.id ? (layerDrop.above ? 'above' : 'below') : undefined}
                    onDragOver={(event) => {
                      if (!draggedLayer || draggedLayer === layer.id) return;
                      event.preventDefault();
                      event.dataTransfer.dropEffect = 'move';
                      const rect = event.currentTarget.getBoundingClientRect();
                      setLayerDrop({ id: layer.id, above: event.clientY < rect.top + rect.height / 2 });
                    }}
                    onDragLeave={(event) => {
                      if (!event.currentTarget.contains(event.relatedTarget as Node | null))
                        setLayerDrop((current) => (current?.id === layer.id ? null : current));
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      const rect = event.currentTarget.getBoundingClientRect();
                      dropLayer(layer.id, event.clientY < rect.top + rect.height / 2);
                      setDraggedLayer(null);
                      setLayerDrop(null);
                    }}
                  >
                    <button
                      type="button"
                      className="canvas-icon"
                      aria-label={layer.visible ? '隐藏' : '显示'}
                      title={`${layer.visible ? '隐藏' : '显示'}：${layer.name}`}
                      disabled={isBusy}
                      onClick={() => updateLayer({ visible: !layer.visible }, layer.id)}
                    >
                      {layer.visible ? <Eye size={16} /> : <EyeSlash size={16} />}
                    </button>
                    <div
                      className="canvas-layer-row"
                      draggable={!isBusy}
                      onDragStart={(event) => {
                        event.dataTransfer.setData('text/plain', layer.id);
                        event.dataTransfer.effectAllowed = 'move';
                        setDraggedLayer(layer.id);
                      }}
                      onDragEnd={() => {
                        setDraggedLayer(null);
                        setLayerDrop(null);
                      }}
                    >
                      <button
                        type="button"
                        className="canvas-layer-select"
                        aria-label={`选择图层：${layer.name}`}
                        aria-pressed={layer.id === activeLayer.id}
                        onClick={() => activateLayer(layer.id)}
                        disabled={isBusy}
                      >
                        <LayerThumbnail pixels={layer.pixels} />
                      </button>
                      <LayerName
                        name={layer.name}
                        disabled={isBusy}
                        onActivate={() => activateLayer(layer.id)}
                        onCommit={(name) => updateLayer({ name }, layer.id)}
                      />
                    </div>
                    <button
                      type="button"
                      className="canvas-icon"
                      aria-label={layer.locked ? '解锁' : '锁定'}
                      title={`${layer.locked ? '解锁' : '锁定'}：${layer.name}`}
                      disabled={isBusy}
                      onClick={() => updateLayer({ locked: !layer.locked }, layer.id)}
                    >
                      {layer.locked ? <LockSimple size={15} /> : <LockSimpleOpen size={15} />}
                    </button>
                  </li>
                ))}
              </ul>
              <div className="canvas-layer-actions">
                <button
                  type="button"
                  className="canvas-icon"
                  title="上移图层"
                  aria-label="上移图层"
                  onClick={() => reorderLayer(1)}
                  disabled={isBusy || snapshot.layers.at(-1) === activeLayer}
                >
                  <ArrowUp size={15} />
                </button>
                <button
                  type="button"
                  className="canvas-icon"
                  title="下移图层"
                  aria-label="下移图层"
                  onClick={() => reorderLayer(-1)}
                  disabled={isBusy || snapshot.layers[0] === activeLayer}
                >
                  <ArrowDown size={15} />
                </button>
                <span />
                <button
                  type="button"
                  className="canvas-icon"
                  title="导入图片"
                  aria-label="导入图片"
                  disabled={isBusy}
                  onClick={() => importInput.current?.click()}
                >
                  <UploadSimple size={16} />
                </button>
                <button
                  type="button"
                  className="canvas-icon"
                  title="新建图层"
                  aria-label="新建图层"
                  disabled={isBusy}
                  onClick={() => addLayer(createLayer(`图层 ${++layerCount.current}`, createPixels(1, 1)))}
                >
                  <Plus size={17} />
                </button>
                <button
                  type="button"
                  className="canvas-icon"
                  title="删除图层"
                  aria-label="删除图层"
                  onClick={deleteLayer}
                  disabled={isBusy || activeLayer.locked || snapshot.layers.length < 2}
                >
                  <Trash size={16} />
                </button>
                <input
                  ref={importInput}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = '';
                    void importLayer(file);
                  }}
                />
              </div>
            </section>
          </aside>
        )}
      </div>

      <div className="node-canvas-editor-modal__footer">
        <div className="node-canvas-editor-modal__status" role="status">
          {error || exportMessage || (isDirty ? '有未保存修改' : '保存为合成 PNG · 图层保留在本次编辑中')}
        </div>
        <div className="node-canvas-editor-modal__actions">
          <button
            type="button"
            className="node-canvas-editor-modal__secondary"
            onClick={() => (transform ? endTransform(false) : void handleClose())}
            disabled={isSaving || isImporting || isDrawing}
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
              disabled={isBusy || !snapshot}
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
            disabled={isBusy || !snapshot || (isSketch && !isDirty)}
          >
            {isSaving ? '保存中...' : isSketch ? '保存到 IO 节点' : '保存图片'}
          </button>
        </div>
      </div>
    </ModalSurface>,
    document.body,
  );
}

function CommitNumber({
  value,
  min,
  max,
  disabled,
  onCommit,
}: {
  value: number;
  min: number;
  max: number;
  disabled?: boolean;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const cancelled = useRef(false);
  return (
    <input
      type="number"
      min={min}
      max={max}
      disabled={disabled}
      value={draft ?? value}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (!cancelled.current && draft?.trim() && Number.isFinite(Number(draft))) {
          const next = Math.max(min, Math.min(max, Math.round(Number(draft))));
          if (next !== value) onCommit(next);
        }
        cancelled.current = false;
        setDraft(null);
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        cancelled.current = event.key === 'Escape';
        event.currentTarget.blur();
      }}
    />
  );
}

function LayerThumbnail({ pixels }: { pixels: HTMLCanvasElement }) {
  const ref = useRef<HTMLImageElement>(null);
  useLayoutEffect(() => {
    const image = ref.current;
    if (!image) return;
    const thumbnail = createPixels(56, 56);
    const scale = Math.min(56 / pixels.width, 56 / pixels.height);
    const width = pixels.width * scale;
    const height = pixels.height * scale;
    thumbnail.getContext('2d')?.drawImage(pixels, (56 - width) / 2, (56 - height) / 2, width, height);
    image.src = thumbnail.toDataURL();
  }, [pixels]);
  return <img ref={ref} className="canvas-layer-thumbnail" alt="" draggable={false} />;
}

function LayerName({
  name,
  disabled,
  onActivate,
  onCommit,
}: {
  name: string;
  disabled: boolean;
  onActivate: () => void;
  onCommit: (name: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const cancelled = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const editing = draft !== null;
  useLayoutEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);
  if (draft === null)
    return (
      <button
        type="button"
        className="canvas-layer-name"
        disabled={disabled}
        title={`${name} · 双击重命名`}
        onClick={onActivate}
        onDoubleClick={() => setDraft(name)}
        onKeyDown={(event) => {
          if (event.key === 'F2') {
            event.preventDefault();
            onActivate();
            setDraft(name);
          }
        }}
      >
        {name}
      </button>
    );
  return (
    <input
      ref={inputRef}
      className="canvas-layer-name"
      aria-label="图层名称"
      maxLength={100}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        const next = draft.trim();
        if (!cancelled.current && next && next !== name) onCommit(next);
        cancelled.current = false;
        setDraft(null);
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        cancelled.current = event.key === 'Escape';
        event.currentTarget.blur();
      }}
    />
  );
}

function MarqueeOutline({ selection, zoom }: { selection: Marquee; zoom: number }) {
  const { x, y, width, height, shape } = selection;
  const geometry =
    shape === 'mask' ? (
      <path d={selection.outline} transform={`scale(${selection.step})`} vectorEffect="non-scaling-stroke" />
    ) : shape === 'lasso' ? (
      <polygon
        points={selection.points.map((point) => `${point.x},${point.y}`).join(' ')}
        vectorEffect="non-scaling-stroke"
      />
    ) : shape === 'ellipse' ? (
      <ellipse cx={width / 2} cy={height / 2} rx={width / 2} ry={height / 2} vectorEffect="non-scaling-stroke" />
    ) : (
      <rect width={width} height={height} vectorEffect="non-scaling-stroke" />
    );
  return (
    <svg
      aria-hidden="true"
      className="canvas-document__selection"
      width={width}
      height={height}
      style={
        { left: x, top: y, '--marquee-dash': `${4 / zoom}px`, '--marquee-step': `${-8 / zoom}px` } as CSSProperties
      }
    >
      <g className="canvas-marquee-shadow">{geometry}</g>
      <g className="canvas-marquee-dash">{geometry}</g>
    </svg>
  );
}

function CanvasSizeControls({
  dimensions,
  disabled,
  isSketch,
  onApply,
}: {
  dimensions: CanvasDimensions;
  disabled: boolean;
  isSketch: boolean;
  onApply: (dimensions: CanvasDimensions, anchorX: number, anchorY: number) => void;
}) {
  const [width, setWidth] = useState(String(dimensions.width));
  const [height, setHeight] = useState(String(dimensions.height));
  const [anchor, setAnchor] = useState('0.5,0.5');
  const maxSide = isSketch ? MAX_SKETCH_SIDE : MAX_IMAGE_SIDE;
  const pixelWidth = Number(width);
  const pixelHeight = Number(height);
  const validSize =
    [pixelWidth, pixelHeight].every((side) => Number.isInteger(side) && side >= MIN_SKETCH_SIDE && side <= maxSide) &&
    pixelWidth * pixelHeight <= MAX_CANVAS_PIXELS;
  const ratio = SKETCH_RATIOS.find(([x, y]) => pixelWidth > 0 && pixelWidth * y === pixelHeight * x);

  return (
    <form
      className="canvas-size-form"
      onSubmit={(event) => {
        event.preventDefault();
        const [anchorX, anchorY] = anchor.split(',').map(Number);
        if (!disabled && validSize) onApply({ width: pixelWidth, height: pixelHeight }, anchorX, anchorY);
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
            const fit = isSketch
              ? Math.floor(longest / Math.max(x, y))
              : Math.ceil(Math.max(dimensions.width / x, dimensions.height / y));
            const unit = Math.max(Math.ceil(MIN_SKETCH_SIDE / Math.min(x, y)), fit);
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
          max={maxSide}
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
          max={maxSide}
          value={height}
          disabled={disabled}
          onChange={(event) => setHeight(event.target.value)}
        />
      </label>
      <fieldset className="canvas-anchor">
        <legend>原图锚点</legend>
        <div>
          {[
            ['0,0', '左上'],
            ['0.5,0', '上'],
            ['1,0', '右上'],
            ['0,0.5', '左'],
            ['0.5,0.5', '居中'],
            ['1,0.5', '右'],
            ['0,1', '左下'],
            ['0.5,1', '下'],
            ['1,1', '右下'],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-label={label}
              aria-pressed={anchor === value}
              title={label}
              disabled={disabled}
              onClick={() => setAnchor(value)}
            >
              <span />
            </button>
          ))}
        </div>
      </fieldset>
      <button
        type="submit"
        className="node-canvas-editor-modal__secondary"
        disabled={disabled || !validSize || (pixelWidth === dimensions.width && pixelHeight === dimensions.height)}
      >
        应用尺寸
      </button>
      {!validSize && (
        <span role="status">
          宽高需为 {MIN_SKETCH_SIDE}–{maxSide} px 的整数，且总像素不超过 3200 万
        </span>
      )}
    </form>
  );
}

function PixelSizeControls({
  dimensions,
  label,
  maxSide,
  disabled,
  message,
  onApply,
}: {
  dimensions: CanvasDimensions;
  label: '图像' | '图层';
  maxSide: number;
  disabled: boolean;
  message?: string;
  onApply: (dimensions: CanvasDimensions) => void;
}) {
  const [size, setSize] = useState({ width: String(dimensions.width), height: String(dimensions.height) });
  const [linked, setLinked] = useState(true);
  const width = Number(size.width);
  const height = Number(size.height);
  const valid =
    [width, height].every((side) => Number.isInteger(side) && side >= 1 && side <= maxSide) &&
    width * height <= MAX_CANVAS_PIXELS;

  function edit(axis: 'width' | 'height', value: string) {
    const other = axis === 'width' ? 'height' : 'width';
    setSize((current) => {
      const next = { ...current, [axis]: value };
      if (linked && Number(value) > 0) {
        next[other] = String(Math.max(1, Math.round((Number(value) * dimensions[other]) / dimensions[axis])));
      }
      return next;
    });
  }

  return (
    <form
      className="canvas-size-form canvas-size-form--pixels"
      onSubmit={(event) => {
        event.preventDefault();
        if (valid && !disabled && (width !== dimensions.width || height !== dimensions.height))
          onApply({ width, height });
      }}
    >
      {(['width', 'height'] as const).map((axis) => (
        <label key={axis}>
          {label}
          {axis === 'width' ? '宽度' : '高度'} (px)
          <input
            type="number"
            min={1}
            max={maxSide}
            value={size[axis]}
            disabled={disabled}
            onChange={(event) => edit(axis, event.target.value)}
          />
        </label>
      ))}
      <label className="canvas-size-link">
        <input
          type="checkbox"
          checked={linked}
          disabled={disabled}
          onChange={(event) => setLinked(event.target.checked)}
        />
        保持比例
      </label>
      <button
        type="submit"
        className="node-canvas-editor-modal__secondary"
        disabled={disabled || !valid || (width === dimensions.width && height === dimensions.height)}
      >
        应用{label}大小
      </button>
      {message && <span className="canvas-size-message">{message}</span>}
      {!valid && <span role="status">宽高需为 1–{maxSide} px 的整数，总像素不超过 3200 万。</span>}
    </form>
  );
}
