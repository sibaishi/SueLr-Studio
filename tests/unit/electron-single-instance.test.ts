import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { setupSingleInstance } = require('../../electron/single-instance.cjs') as {
  setupSingleInstance: (
    app: {
      requestSingleInstanceLock: () => boolean;
      quit: () => void;
      on: (event: string, handler: () => void) => void;
    },
    focusMainWindow: () => void,
  ) => { hasLock: boolean };
};

describe('Electron single instance guard', () => {
  it('quits immediately when the single instance lock is unavailable', () => {
    const quit = vi.fn();
    const on = vi.fn();

    const result = setupSingleInstance({
      requestSingleInstanceLock: () => false,
      quit,
      on,
    }, () => {});

    expect(result).toEqual({ hasLock: false });
    expect(quit).toHaveBeenCalledOnce();
    expect(on).not.toHaveBeenCalled();
  });

  it('focuses the existing window on second-instance', () => {
    const handlers = new Map<string, () => void>();
    const focusMainWindow = vi.fn();

    const result = setupSingleInstance({
      requestSingleInstanceLock: () => true,
      quit: vi.fn(),
      on: (event, handler) => {
        handlers.set(event, handler);
      },
    }, focusMainWindow);

    expect(result).toEqual({ hasLock: true });
    handlers.get('second-instance')?.();
    expect(focusMainWindow).toHaveBeenCalledOnce();
  });
});
