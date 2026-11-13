export type CanvasPoint = { x: number; y: number };
export type CanvasRect = CanvasPoint & { width: number; height: number };
export type CanvasTransform = CanvasRect & { angle: number };
export type TransformHandle = 'move' | 'rotate' | 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

export function rotatePoint({ x, y }: CanvasPoint, angle: number): CanvasPoint {
  return { x: x * Math.cos(angle) - y * Math.sin(angle), y: x * Math.sin(angle) + y * Math.cos(angle) };
}

export function dragTransform(
  frame: CanvasTransform,
  handle: TransformHandle,
  start: CanvasPoint,
  point: CanvasPoint,
  constrain: boolean,
): CanvasTransform {
  const delta = { x: point.x - start.x, y: point.y - start.y };
  if (handle === 'move') return { ...frame, x: frame.x + delta.x, y: frame.y + delta.y };
  const center = { x: frame.x + frame.width / 2, y: frame.y + frame.height / 2 };
  if (handle === 'rotate') {
    const angle =
      frame.angle +
      Math.atan2(point.y - center.y, point.x - center.x) -
      Math.atan2(start.y - center.y, start.x - center.x);
    const step = Math.PI / 12;
    return { ...frame, angle: constrain ? Math.round(angle / step) * step : angle };
  }

  const dx = handle.includes('w') ? -1 : handle.includes('e') ? 1 : 0;
  const dy = handle.includes('n') ? -1 : handle.includes('s') ? 1 : 0;
  const local = rotatePoint(delta, -frame.angle);
  let width = Math.max(1, frame.width + local.x * dx);
  let height = Math.max(1, frame.height + local.y * dy);
  if (constrain && dx && dy) {
    const scale = Math.max(
      1 / Math.min(frame.width, frame.height),
      (width * frame.width + height * frame.height) / (frame.width ** 2 + frame.height ** 2),
    );
    width = frame.width * scale;
    height = frame.height * scale;
  }
  const shift = rotatePoint(
    { x: ((width - frame.width) * dx) / 2, y: ((height - frame.height) * dy) / 2 },
    frame.angle,
  );
  return { x: center.x + shift.x - width / 2, y: center.y + shift.y - height / 2, width, height, angle: frame.angle };
}

export function transformBounds(frame: CanvasTransform): CanvasRect {
  const centerX = frame.x + frame.width / 2;
  const centerY = frame.y + frame.height / 2;
  const halfWidth =
    (Math.abs(Math.cos(frame.angle)) * frame.width + Math.abs(Math.sin(frame.angle)) * frame.height) / 2;
  const halfHeight =
    (Math.abs(Math.sin(frame.angle)) * frame.width + Math.abs(Math.cos(frame.angle)) * frame.height) / 2;
  const x = Math.floor(centerX - halfWidth + 1e-8);
  const y = Math.floor(centerY - halfHeight + 1e-8);
  return { x, y, width: Math.ceil(centerX + halfWidth - 1e-8) - x, height: Math.ceil(centerY + halfHeight - 1e-8) - y };
}

export function drawTransformed(context: CanvasRenderingContext2D, source: HTMLCanvasElement, frame: CanvasTransform) {
  context.save();
  context.translate(frame.x + frame.width / 2, frame.y + frame.height / 2);
  context.rotate(frame.angle);
  context.drawImage(source, -frame.width / 2, -frame.height / 2, frame.width, frame.height);
  context.restore();
}

// Scan in strips so a large layer does not need a second full-size RGBA buffer.
export function findInkBounds(source: HTMLCanvasElement): CanvasRect | null {
  const context = source.getContext('2d');
  if (!context) return null;
  const { width, height } = source;
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y += 128) {
    const rows = Math.min(128, height - y);
    const { data } = context.getImageData(0, y, width, rows);
    for (let i = 3; i < data.length; i += 4) {
      if (!data[i]) continue;
      const pixel = (i - 3) / 4;
      const column = pixel % width;
      const row = y + Math.floor(pixel / width);
      left = Math.min(left, column);
      top = Math.min(top, row);
      right = Math.max(right, column);
      bottom = Math.max(bottom, row);
    }
  }
  return right < 0 ? null : { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

export function snapCanvasMove(frame: CanvasTransform, targets: CanvasRect[], threshold: number) {
  const width = Math.abs(Math.cos(frame.angle)) * frame.width + Math.abs(Math.sin(frame.angle)) * frame.height;
  const height = Math.abs(Math.sin(frame.angle)) * frame.width + Math.abs(Math.cos(frame.angle)) * frame.height;
  const bounds = { x: frame.x + (frame.width - width) / 2, y: frame.y + (frame.height - height) / 2, width, height };
  const guides: Partial<CanvasPoint> = {};
  const snapped = { ...frame };

  for (const axis of ['x', 'y'] as const) {
    const size = axis === 'x' ? 'width' : 'height';
    const anchors = [bounds[axis], bounds[axis] + bounds[size] / 2, bounds[axis] + bounds[size]];
    let best = threshold;
    let offset = 0;
    for (const target of targets) {
      for (const guide of [target[axis], target[axis] + target[size] / 2, target[axis] + target[size]]) {
        for (const anchor of anchors) {
          const distance = Math.abs(guide - anchor);
          if (distance > best || (guides[axis] !== undefined && distance === best)) continue;
          best = distance;
          offset = guide - anchor;
          guides[axis] = guide;
        }
      }
    }
    snapped[axis] += offset;
  }

  return { frame: snapped, guides };
}

export function snapCanvasPoint(point: CanvasPoint, targets: CanvasRect[], threshold: number) {
  const result = snapCanvasMove({ ...point, width: 0, height: 0, angle: 0 }, targets, threshold);
  return { point: { x: result.frame.x, y: result.frame.y }, guides: result.guides };
}

export function snapCanvasResize(
  frame: CanvasTransform,
  handle: TransformHandle,
  start: CanvasPoint,
  point: CanvasPoint,
  constrain: boolean,
  targets: CanvasRect[],
  threshold: number,
) {
  const dx = handle.includes('w') ? -1 : handle.includes('e') ? 1 : 0;
  const dy = handle.includes('n') ? -1 : handle.includes('s') ? 1 : 0;
  const handlePoint = (value: CanvasTransform) => {
    const offset = rotatePoint({ x: (dx * value.width) / 2, y: (dy * value.height) / 2 }, value.angle);
    return { x: value.x + value.width / 2 + offset.x, y: value.y + value.height / 2 + offset.y };
  };
  const raw = dragTransform(frame, handle, start, point, constrain);
  const anchor = handlePoint(raw);
  const snap = snapCanvasPoint(anchor, targets, threshold);
  let best = { frame: raw, guides: {} as Partial<CanvasPoint> };
  for (const axes of [['x', 'y'], ['x'], ['y']] as const) {
    const next = { ...point };
    for (const axis of axes) next[axis] += snap.point[axis] - anchor[axis];
    const resized = dragTransform(frame, handle, start, next, constrain);
    const actual = handlePoint(resized);
    const guides: Partial<CanvasPoint> = {};
    for (const axis of axes) {
      const guide = snap.guides[axis];
      if (guide !== undefined && Math.abs(actual[axis] - guide) < 0.01) guides[axis] = guide;
    }
    if (Object.keys(guides).length > Object.keys(best.guides).length) best = { frame: resized, guides };
  }
  return best;
}
