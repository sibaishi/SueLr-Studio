import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { createMainWindow, focusWindow, WINDOW_OPTIONS } = require('../../electron/window-lifecycle.cjs') as {
  createMainWindow: (options: {
    BrowserWindow: new (options: Record<string, unknown>) => {
      webContents: { setWindowOpenHandler: (handler: ({ url }: { url: string }) => { action: string }) => void };
      loadURL: (url: string) => void;
    };
    shell: { openExternal: (url: string) => void };
    url: string;
    iconPath: string;
  }) => {
    webContents: { setWindowOpenHandler: (handler: ({ url }: { url: string }) => { action: string }) => void };
    loadURL: (url: string) => void;
  };
  focusWindow: (window: {
    isMinimized?: () => boolean;
    restore?: () => void;
    focus?: () => void;
  } | null | undefined) => boolean;
  WINDOW_OPTIONS: Record<string, unknown>;
};

describe('Electron window lifecycle helpers', () => {
  it('creates the main window with fixed shell options and external link handling', () => {
    const openExternal = vi.fn();
    const loadURL = vi.fn();
    let capturedOptions: Record<string, unknown> | null = null;
    let openHandler: ((payload: { url: string }) => { action: string }) | undefined;

    class BrowserWindowStub {
      webContents = {
        setWindowOpenHandler(handler: (payload: { url: string }) => { action: string }) {
          openHandler = handler;
        },
      };

      constructor(options: Record<string, unknown>) {
        capturedOptions = options;
      }

      loadURL(url: string) {
        loadURL(url);
      }
    }

    createMainWindow({
      BrowserWindow: BrowserWindowStub as never,
      shell: { openExternal },
      url: 'http://127.0.0.1:3001',
      iconPath: 'build/icon.ico',
    });

    expect(capturedOptions).toMatchObject({
      ...WINDOW_OPTIONS,
      icon: 'build/icon.ico',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    expect(loadURL).toHaveBeenCalledWith('http://127.0.0.1:3001');
    const secondInstanceResult = openHandler?.({ url: 'https://example.com' }) ?? null;
    expect(secondInstanceResult).toEqual({ action: 'deny' });
    expect(openExternal).toHaveBeenCalledWith('https://example.com');
  });

  it('restores minimized windows before focusing them', () => {
    const restore = vi.fn();
    const focus = vi.fn();

    expect(focusWindow({
      isMinimized: () => true,
      restore,
      focus,
    })).toBe(true);

    expect(restore).toHaveBeenCalledOnce();
    expect(focus).toHaveBeenCalledOnce();
  });
});
