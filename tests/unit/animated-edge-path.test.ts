import { getAnimatedEdgeTiming } from '@/shared/ui/AnimatedEdgePath';
import { describe, expect, it } from 'vitest';

describe('getAnimatedEdgeTiming', () => {
  it('preserves the existing particle count and evenly distributes start offsets', () => {
    expect(getAnimatedEdgeTiming(2, 0.35)).toEqual({ count: 6, step: 2 / 6 });
  });

  it('always renders at least two moving shapes', () => {
    expect(getAnimatedEdgeTiming(1, 5)).toEqual({ count: 2, step: 0.5 });
  });
});
