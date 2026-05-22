import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { buildRelaunchOptions, resolvePortableRelaunchPath } = require('../../electron/relaunch.cjs') as {
  buildRelaunchOptions: (options: {
    platform: string;
    isPackaged: boolean;
    portableExecutableFile?: string;
    exists?: (filePath: string) => boolean;
  }) => { execPath: string } | undefined;
  resolvePortableRelaunchPath: (options: {
    platform: string;
    isPackaged: boolean;
    portableExecutableFile?: string;
    exists?: (filePath: string) => boolean;
  }) => string | null;
};

describe('Electron relaunch options', () => {
  it('uses the outer portable executable for packaged Windows single-file builds', () => {
    const executable = 'C:\\Apps\\SueLr-Studio.exe';

    expect(buildRelaunchOptions({
      platform: 'win32',
      isPackaged: true,
      portableExecutableFile: executable,
      exists: () => true,
    })).toEqual({ execPath: executable });
  });

  it('falls back to default relaunch outside portable packaged Windows builds', () => {
    const executable = 'C:\\Apps\\SueLr-Studio.exe';

    expect(resolvePortableRelaunchPath({
      platform: 'linux',
      isPackaged: true,
      portableExecutableFile: executable,
      exists: () => true,
    })).toBeNull();
    expect(buildRelaunchOptions({
      platform: 'win32',
      isPackaged: false,
      portableExecutableFile: executable,
      exists: () => true,
    })).toBeUndefined();
    expect(buildRelaunchOptions({
      platform: 'win32',
      isPackaged: true,
      portableExecutableFile: 'SueLr-Studio.exe',
      exists: () => true,
    })).toBeUndefined();
  });
});
