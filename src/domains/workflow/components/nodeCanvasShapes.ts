import type { CanvasPoint, CanvasTransform } from './nodeCanvasTransform';

export const SHAPE_LABELS = {
  line: '直线',
  arrow: '箭头',
  rectangle: '矩形',
  rounded: '圆角矩形',
  ellipse: '椭圆',
  polygon: '正多边形',
} as const;
export type ShapeKind = keyof typeof SHAPE_LABELS;
export type ShapeDraft = {
  kind: ShapeKind | 'freehand';
  frame: CanvasTransform;
  sides: number;
  corner: number;
  points?: CanvasPoint[];
};

export function smoothPointer<T extends CanvasPoint>(previous: T, sample: T, elapsed: number, strength: number): T {
  if (!strength) return sample;
  const weight = -Math.expm1(-Math.max(1, elapsed) / (8 + strength * 0.9));
  return {
    ...sample,
    x: previous.x + (sample.x - previous.x) * weight,
    y: previous.y + (sample.y - previous.y) * weight,
  };
}

export function makeShape(kind: ShapeKind, start: CanvasPoint, end: CanvasPoint, shift = false): ShapeDraft {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  let width = Math.max(1, Math.abs(dx));
  let height = Math.max(1, Math.abs(dy));
  let angle = 0;
  let x = Math.min(start.x, end.x);
  let y = Math.min(start.y, end.y);
  if (kind === 'line' || kind === 'arrow') {
    width = Math.max(1, Math.hypot(dx, dy));
    height = Math.max(1, width * 0.25);
    angle = Math.atan2(dy, dx);
    if (shift) angle = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
    x = start.x + (Math.cos(angle) * width) / 2 - width / 2;
    y = start.y + (Math.sin(angle) * width) / 2 - height / 2;
  } else if (shift) {
    width = height = Math.max(width, height);
    x = start.x - (dx < 0 ? width : 0);
    y = start.y - (dy < 0 ? height : 0);
  }
  return { kind, frame: { x, y, width, height, angle }, corner: 12, sides: 5 };
}

export function shapePath(draft: ShapeDraft) {
  const { width: w, height: h } = draft.frame;
  switch (draft.kind) {
    case 'line':
      return `M0 ${h / 2}H${w}`;
    case 'arrow':
      return `M0 ${h / 2}H${w}M${w * 0.76} 0L${w} ${h / 2}L${w * 0.76} ${h}`;
    case 'rectangle':
      return `M0 0H${w}V${h}H0Z`;
    case 'rounded': {
      const r = Math.min(draft.corner, w / 2, h / 2);
      return `M${r} 0H${w - r}Q${w} 0 ${w} ${r}V${h - r}Q${w} ${h} ${w - r} ${h}H${r}Q0 ${h} 0 ${h - r}V${r}Q0 0 ${r} 0Z`;
    }
    case 'ellipse':
      return `M0 ${h / 2}a${w / 2} ${h / 2} 0 1 0 ${w} 0a${w / 2} ${h / 2} 0 1 0 ${-w} 0Z`;
    case 'polygon':
      return (
        Array.from({ length: draft.sides }, (_, i) => {
          const angle = (2 * Math.PI * i) / draft.sides - Math.PI / 2;
          return `${i ? 'L' : 'M'}${(w * (1 + Math.cos(angle))) / 2} ${(h * (1 + Math.sin(angle))) / 2}`;
        }).join('') + 'Z'
      );
    case 'freehand':
      return draft.points?.map(({ x, y }, i) => `${i ? 'L' : 'M'}${x * w} ${y * h}`).join('') ?? '';
  }
}

function distance(a: CanvasPoint, b: CanvasPoint) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function segmentDistance(point: CanvasPoint, a: CanvasPoint, b: CanvasPoint) {
  const length = distance(a, b);
  if (!length) return distance(point, a);
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * (b.x - a.x) + (point.y - a.y) * (b.y - a.y)) / length ** 2));
  return distance(point, { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) });
}

function simplify(points: CanvasPoint[], tolerance: number): CanvasPoint[] {
  const first = points[0];
  const last = points[points.length - 1];
  let split = -1;
  let max = tolerance;
  for (let i = 1; i < points.length - 1; i++) {
    const error = segmentDistance(points[i], first, last);
    if (error > max) {
      max = error;
      split = i;
    }
  }
  return split < 0
    ? [first, last]
    : [...simplify(points.slice(0, split + 1), tolerance).slice(0, -1), ...simplify(points.slice(split), tolerance)];
}

export function recognizeShape(points: CanvasPoint[]): ShapeDraft {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const start = { x: Math.min(...xs), y: Math.min(...ys) };
  const end = { x: Math.max(...xs), y: Math.max(...ys) };
  const base = makeShape('rectangle', start, end);
  const { width, height } = base.frame;
  const first = points[0];
  const last = points[points.length - 1];
  const diagonal = Math.hypot(width, height);
  const reduced = simplify(points, Math.max(1, diagonal * 0.055));
  if (
    diagonal > 6 &&
    distance(first, last) > diagonal * 0.8 &&
    points.every((p) => segmentDistance(p, first, last) < diagonal * 0.06)
  ) {
    return makeShape('line', first, last);
  }
  if (reduced.length === 5 && distance(reduced[1], reduced[3]) < diagonal * 0.13) {
    const tip = reduced[1];
    const axis = { x: tip.x - first.x, y: tip.y - first.y };
    const wings = [reduced[2], reduced[4]].map((p) => ({ x: p.x - tip.x, y: p.y - tip.y }));
    const cross = (p: CanvasPoint) => axis.x * p.y - axis.y * p.x;
    if (
      distance(first, tip) > diagonal * 0.65 &&
      cross(wings[0]) * cross(wings[1]) < 0 &&
      wings.every((p) => axis.x * p.x + axis.y * p.y < 0 && Math.hypot(p.x, p.y) < diagonal * 0.48)
    ) {
      return makeShape('arrow', first, tip);
    }
  }
  if (points.length >= 4 && Math.min(width, height) > 5 && distance(first, last) < diagonal * 0.19) {
    // Split the closed contour at its farthest point before simplifying both halves.
    let split = 1;
    for (let i = 2; i < points.length; i++) if (distance(first, points[i]) > distance(first, points[split])) split = i;
    const corners = [
      ...simplify(points.slice(0, split + 1), diagonal * 0.07).slice(0, -1),
      ...simplify([...points.slice(split), first], diagonal * 0.07).slice(0, -1),
    ];
    // A stroke may start partway along a straight edge.
    if (corners.length > 3 && segmentDistance(first, corners[1], corners[corners.length - 1]) < diagonal * 0.045)
      corners.shift();
    if (corners.length === 3) return { ...base, kind: 'polygon', sides: 3 };
    const nearRightAngles =
      corners.length === 4 &&
      corners.every((p, i) => {
        const a = corners[(i + 3) % 4];
        const b = corners[(i + 1) % 4];
        return Math.abs((a.x - p.x) * (b.x - p.x) + (a.y - p.y) * (b.y - p.y)) < distance(a, p) * distance(b, p) * 0.32;
      });
    if (nearRightAngles) {
      const a = corners[0],
        b = corners[1],
        c = corners[2];
      const w = distance(a, b),
        h = distance(b, c);
      return {
        ...base,
        frame: {
          x: (a.x + c.x - w) / 2,
          y: (a.y + c.y - h) / 2,
          width: w,
          height: h,
          angle: Math.atan2(b.y - a.y, b.x - a.x),
        },
      };
    }
    const ellipseError =
      points.reduce(
        (sum, p) =>
          sum + Math.abs(Math.hypot((2 * (p.x - start.x)) / width - 1, (2 * (p.y - start.y)) / height - 1) - 1),
        0,
      ) / points.length;
    if (corners.length >= 5 && ellipseError < 0.16) return { ...base, kind: 'ellipse' };
  }
  return {
    ...base,
    kind: 'freehand',
    points: points.map((p) => ({ x: (p.x - start.x) / width, y: (p.y - start.y) / height })),
  };
}
