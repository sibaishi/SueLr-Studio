import { createRequire } from 'node:module';
import { expect, it, vi } from 'vitest';

const { createAppIconController } = createRequire(import.meta.url)('../../electron/app-icon.cjs');

function setup(platform: string) {
  const origin = 'http://127.0.0.1:3001';
  const dock = { setIcon: vi.fn() };
  const mainFrame = { origin };
  const webContents = { mainFrame };
  const window = { webContents, setIcon: vi.fn(), isDestroyed: vi.fn(() => false) };
  const controller = createAppIconController({
    dock,
    getWindow: () => window,
    platform,
    resolveAppPath: (...segments: string[]) => segments.join('/'),
  });
  const event = { sender: webContents, senderFrame: mainFrame };
  const setTheme = controller.handleTheme(origin);
  return { controller, dock, event, mainFrame, setTheme, window };
}

it.each(['darwin', 'win32', 'linux'])('switches both icon variants on %s', (platform) => {
  const { controller, dock, event, setTheme, window } = setup(platform);
  setTheme(event, 'light');
  setTheme(event, 'dark');

  const target = platform === 'darwin' ? dock : window;
  const other = platform === 'darwin' ? window : dock;
  expect(target.setIcon.mock.calls).toEqual([['build/icon-light.png'], ['build/icon.png']]);
  expect(other.setIcon).not.toHaveBeenCalled();
  expect(controller.initialIconPath).toBe(platform === 'win32' ? 'build/icon.ico' : 'build/icon.png');
});

it('accepts only a known theme from the Studio main frame', () => {
  const { dock, event, mainFrame, setTheme, window } = setup('darwin');
  setTheme(event, '../unexpected.png');
  setTheme({ ...event, sender: {} }, 'light');
  setTheme({ ...event, senderFrame: { ...mainFrame } }, 'light');
  setTheme({ ...event, senderFrame: null }, 'light');
  mainFrame.origin = 'https://example.com';
  setTheme(event, 'light');
  mainFrame.origin = 'http://127.0.0.1:3001';
  window.isDestroyed.mockReturnValue(true);
  setTheme(event, 'light');

  expect(dock.setIcon).not.toHaveBeenCalled();
});
