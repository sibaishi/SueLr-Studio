import { describe, expect, it } from 'vitest';
import { makeShape, recognizeShape, smoothPointer } from '@/domains/workflow/components/nodeCanvasShapes';

const points = (pairs: number[][]) => pairs.map(([x, y]) => ({ x, y }));

describe('canvas drawing aids', () => {
  it('reduces coordinate jitter, preserves pressure and is bypassed at zero', () => {
    const initial = { x: 0, y: 0, radius: 2 };
    const sample = { x: 1, y: 10, radius: 8 };
    expect(smoothPointer(initial, sample, 16, 0)).toBe(sample);
    const damped = smoothPointer(initial, sample, 16, 80);
    expect(damped.y).toBeLessThan(3);
    expect(damped.radius).toBe(8);
    expect(smoothPointer(initial, sample, 32, 80).y).toBeGreaterThan(damped.y);
  });

  it('recognizes familiar contours and preserves an irregular open stroke', () => {
    expect(
      recognizeShape(
        points([
          [0, 0],
          [20, 1],
          [40, 0],
        ]),
      ).kind,
    ).toBe('line');
    expect(
      recognizeShape(
        points([
          [0, 10],
          [60, 10],
          [47, 0],
          [60, 10],
          [47, 20],
        ]),
      ).kind,
    ).toBe('arrow');
    expect(
      recognizeShape(
        points([
          [0, 0],
          [60, 0],
          [60, 40],
          [0, 40],
          [0, 0],
        ]),
      ).kind,
    ).toBe('rectangle');
    expect(
      recognizeShape(
        points([
          [0, 0],
          [60, 0],
          [30, 40],
          [0, 0],
        ]),
      ),
    ).toMatchObject({ kind: 'polygon', sides: 3 });
    const ellipse = Array.from({ length: 33 }, (_, i) => ({
      x: Math.cos((i * Math.PI) / 16) * 60,
      y: Math.sin((i * Math.PI) / 16) * 35,
    }));
    expect(recognizeShape(ellipse).kind).toBe('ellipse');
    expect(
      recognizeShape(
        points([
          [0, 0],
          [20, 40],
          [40, 0],
          [60, 50],
        ]),
      ).kind,
    ).toBe('freehand');
  });

  it('constrains shapes and snaps lines in the direction of the drag', () => {
    const start = { x: 10, y: 20 };
    expect(makeShape('ellipse', start, { x: -10, y: 30 }, true).frame).toMatchObject({
      x: -10,
      y: 20,
      width: 20,
      height: 20,
    });
    expect(makeShape('line', start, { x: 30, y: 37 }, true).frame.angle).toBe(Math.PI / 4);
  });
});
