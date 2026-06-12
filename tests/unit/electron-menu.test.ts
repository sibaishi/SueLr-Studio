import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { buildApplicationMenuTemplate } = require('../../electron/menu.cjs') as {
  buildApplicationMenuTemplate: (options: {
    appName: string;
    platform: string;
    onOpenDataDirectory: () => void;
    onOpenLogsDirectory: () => void;
    onRelaunch: () => void;
  }) => Array<Record<string, unknown>>;
};

describe('Electron menu template', () => {
  it('keeps local system tools available without an independent admin console item', () => {
    const onOpenDataDirectory = vi.fn();
    const onOpenLogsDirectory = vi.fn();
    const onRelaunch = vi.fn();
    const template = buildApplicationMenuTemplate({
      appName: 'SueLr Studio',
      platform: 'win32',
      onOpenDataDirectory,
      onOpenLogsDirectory,
      onRelaunch,
    });

    const toolsMenu = template.find((item) =>
      ((item.submenu ?? []) as Array<Record<string, unknown>>).some((subItem) => subItem.click === onOpenDataDirectory),
    );
    expect(toolsMenu).toBeTruthy();

    const submenu = (toolsMenu?.submenu ?? []) as Array<Record<string, unknown>>;
    expect(submenu.some((item) => String(item.label || '').includes('绠＄悊绔'))).toBe(false);

    (submenu.find((item) => item.click === onOpenDataDirectory)?.click as (() => void) | undefined)?.();
    (submenu.find((item) => item.click === onOpenLogsDirectory)?.click as (() => void) | undefined)?.();
    (submenu.find((item) => item.click === onRelaunch)?.click as (() => void) | undefined)?.();

    expect(onOpenDataDirectory).toHaveBeenCalledOnce();
    expect(onOpenLogsDirectory).toHaveBeenCalledOnce();
    expect(onRelaunch).toHaveBeenCalledOnce();
  });
});
