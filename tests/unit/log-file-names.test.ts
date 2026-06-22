import { describe, expect, test } from 'vitest';
import {
  logDatePart,
  logTimePart,
  sanitizeLogFilePart,
} from '../../backend/src/platform/logging/log-file-names';

describe('log file name helpers', () => {
  test('sanitizes unsafe and whitespace characters with a stable limit', () => {
    expect(sanitizeLogFilePart(' a/b:c* d ', 'fallback')).toBe('_a-b-c-_d_');
    expect(sanitizeLogFilePart('', 'fallback')).toBe('fallback');
    expect(sanitizeLogFilePart('x'.repeat(100), 'fallback')).toHaveLength(80);
  });

  test('formats UTC date and timestamp parts', () => {
    const date = new Date('2026-06-22T01:02:03.456Z');
    expect(logDatePart(date)).toBe('2026-06-22');
    expect(logTimePart(date)).toBe('2026-06-22T01-02-03-456Z');
  });
});
