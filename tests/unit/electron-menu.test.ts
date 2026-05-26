import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { buildApplicationMenuTemplate } = require('../../electron/menu.cjs') as {
  buildApplicationMenuTemplate: (options: {
    appName: string;
    platform: string;
    onOpenAdmin: () => void;
  }) => Array<Record<string, unknown>>;
};

describe('Electron menu template', () => {
  it('includes a tools menu item that delegates opening the admin console', () => {
    const onOpenAdmin = vi.fn();
    const template = buildApplicationMenuTemplate({
      appName: 'SueLr Studio',
      platform: 'win32',
      onOpenAdmin,
    });

    const toolsMenu = template.find((item) => item.label === '工具');
    expect(toolsMenu).toBeTruthy();

    const submenu = (toolsMenu?.submenu ?? []) as Array<Record<string, unknown>>;
    const openAdminItem = submenu.find((item) => item.label === '打开管理端');
    expect(openAdminItem).toBeTruthy();

    (openAdminItem?.click as (() => void) | undefined)?.();
    expect(onOpenAdmin).toHaveBeenCalledOnce();
  });
});
