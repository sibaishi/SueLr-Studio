import { expect, it } from 'vitest';
import { snapCanvasMove, snapCanvasPoint, snapCanvasResize } from '@/domains/workflow/components/nodeCanvasTransform';

it('snaps to the nearest layer edge and canvas center independently', () => {
  const result = snapCanvasMove(
    { x: 28.5, y: 42, width: 20, height: 20, angle: 0 },
    [{ x: 0, y: 0, width: 100, height: 100 }, { x: 29, y: 75, width: 20, height: 20 }],
    3,
  );
  expect(result.frame).toMatchObject({ x: 29, y: 40 });
  expect(result.guides).toEqual({ x: 29, y: 50 });
});

it('keeps the position when the guide is outside the tolerance', () => {
  const frame = { x: 12, y: 14, width: 10, height: 10, angle: Math.PI / 2 };
  expect(snapCanvasMove(frame, [{ x: 0, y: 0, width: 100, height: 100 }], 3))
    .toEqual({ frame, guides: {} });
});

it('snaps selection points and resize handles without moving the opposite edge', () => {
  const targets = [{ x: 0, y: 0, width: 100, height: 100 }];
  expect(snapCanvasPoint({ x: 2, y: 49 }, targets, 3))
    .toEqual({ point: { x: 0, y: 50 }, guides: { x: 0, y: 50 } });
  const frame = { x: 20, y: 20, width: 20, height: 20, angle: 0 };
  expect(snapCanvasResize(frame, 'se', { x: 40, y: 40 }, { x: 48, y: 52 }, false, targets, 3))
    .toEqual({ frame: { ...frame, width: 30, height: 30 }, guides: { x: 50, y: 50 } });
});
