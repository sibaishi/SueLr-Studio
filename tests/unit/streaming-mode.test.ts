import { mapLegacyStreamingMode } from '@/features/settings/streamingMode';
import { describe, expect, test } from 'vitest';

describe('mapLegacyStreamingMode', () => {
  test.each([
    ['real', 'stream'],
    ['stream', 'stream'],
    ['non-stream', 'non-stream'],
    [true, 'non-stream'],
    [null, 'non-stream'],
  ])('maps %j to %s', (input, expected) => {
    expect(mapLegacyStreamingMode(input)).toBe(expected);
  });
});
