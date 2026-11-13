import { type CanvasPoint, type CanvasRect, findInkBounds } from './nodeCanvasTransform';

export type SelectionMode = 'replace' | 'add' | 'subtract' | 'intersect';
export type Marquee = CanvasRect &
  (
    | { shape: 'rectangle' | 'ellipse' }
    | { shape: 'lasso'; points: CanvasPoint[] }
    | { shape: 'mask'; pixels: HTMLCanvasElement; outline: string; step: number }
  );

export function traceMarquee(context: CanvasRenderingContext2D, selection: Marquee) {
  const { x, y, width, height, shape } = selection;
  context.beginPath();
  if (shape === 'lasso') {
    selection.points.forEach((point, index) => {
      if (index === 0) context.moveTo(x + point.x, y + point.y);
      else context.lineTo(x + point.x, y + point.y);
    });
    context.closePath();
  } else if (shape === 'ellipse')
    context.ellipse(x + width / 2, y + height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
  else context.rect(x, y, width, height);
}

function raster(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

export function makeSelectionMask(selection: Marquee, feather: number) {
  if (!feather) return selection;
  const padding = Math.ceil(feather * 2);
  const pixels = raster(selection.width + padding * 2, selection.height + padding * 2);
  const context = pixels.getContext('2d')!;
  context.filter = `blur(${feather / 2}px)`;
  context.translate(padding - selection.x, padding - selection.y);
  if (selection.shape === 'mask') context.drawImage(selection.pixels, selection.x, selection.y);
  else {
    traceMarquee(context, selection);
    context.fill();
  }
  return describeMask(pixels, selection.x - padding, selection.y - padding);
}

function drawSelection(context: CanvasRenderingContext2D, selection: Marquee) {
  if (selection.shape === 'mask') context.drawImage(selection.pixels, selection.x, selection.y);
  else {
    traceMarquee(context, selection);
    context.fill();
  }
}

export function combineSelection(
  previous: Marquee,
  next: Marquee,
  mode: Exclude<SelectionMode, 'replace'>,
): Marquee | null {
  const left = mode === 'add' ? Math.min(previous.x, next.x) : previous.x;
  const top = mode === 'add' ? Math.min(previous.y, next.y) : previous.y;
  const right =
    mode === 'add' ? Math.max(previous.x + previous.width, next.x + next.width) : previous.x + previous.width;
  const bottom =
    mode === 'add' ? Math.max(previous.y + previous.height, next.y + next.height) : previous.y + previous.height;
  const pixels = raster(right - left, bottom - top);
  const context = pixels.getContext('2d')!;
  context.translate(-left, -top);
  drawSelection(context, previous);
  if (mode === 'intersect') {
    const overlay = raster(pixels.width, pixels.height);
    const overlayContext = overlay.getContext('2d')!;
    overlayContext.translate(-left, -top);
    drawSelection(overlayContext, next);
    context.globalCompositeOperation = 'destination-in';
    context.drawImage(overlay, left, top);
  } else {
    context.globalCompositeOperation = mode === 'subtract' ? 'destination-out' : 'source-over';
    drawSelection(context, next);
  }
  return describeMask(pixels, left, top);
}

function describeMask(pixels: HTMLCanvasElement, x: number, y: number): Marquee | null {
  const bounds = findInkBounds(pixels);
  if (!bounds) return null;
  const { x: left, y: top, width, height } = bounds;
  const cropped = width === pixels.width && height === pixels.height ? pixels : raster(width, height);
  if (cropped !== pixels) cropped.getContext('2d')!.drawImage(pixels, -left, -top);
  const step = Math.max(1, Math.ceil(Math.max(cropped.width, cropped.height) / 768));
  const preview = raster(Math.ceil(cropped.width / step), Math.ceil(cropped.height / step));
  const context = preview.getContext('2d')!;
  context.drawImage(cropped, 0, 0, cropped.width / step, cropped.height / step);
  const { data } = context.getImageData(0, 0, preview.width, preview.height);
  const inside = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < preview.width && y < preview.height && data[(y * preview.width + x) * 4 + 3] >= 32;
  const segments: string[] = [];
  for (let row = 0; row < preview.height; row++) {
    for (let column = 0; column < preview.width; column++) {
      if (!inside(column, row)) continue;
      if (!inside(column, row - 1)) segments.push(`M${column} ${row}h1`);
      if (!inside(column, row + 1)) segments.push(`M${column} ${row + 1}h1`);
      if (!inside(column - 1, row)) segments.push(`M${column} ${row}v1`);
      if (!inside(column + 1, row)) segments.push(`M${column + 1} ${row}v1`);
    }
  }
  return {
    shape: 'mask',
    pixels: cropped,
    x: x + left,
    y: y + top,
    width: cropped.width,
    height: cropped.height,
    outline: segments.join(''),
    step,
  };
}

export function maskSelection(context: CanvasRenderingContext2D, selection: Marquee, x: number, y: number) {
  context.save();
  context.globalCompositeOperation = 'destination-in';
  if (selection.shape === 'mask') context.drawImage(selection.pixels, selection.x - x, selection.y - y);
  else {
    context.translate(-x, -y);
    drawSelection(context, selection);
  }
  context.restore();
}
