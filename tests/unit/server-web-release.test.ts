import { describe, expect, test } from 'vitest';
import { existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

describe('server-web release directory', () => {
  test('contains only minimized runtime app sources', () => {
    const repoRoot = resolve(__dirname, '../..');
    const releaseDir = resolve(repoRoot, '.server-web-release');
    const appDir = resolve(releaseDir, 'app');

    rmSync(releaseDir, { recursive: true, force: true });
    execFileSync(process.execPath, [resolve(repoRoot, 'scripts/build-server-web-release.mjs')], {
      cwd: repoRoot,
      stdio: 'pipe',
    });

    expect(existsSync(resolve(appDir, 'index.html'))).toBe(true);
    expect(existsSync(resolve(appDir, 'src'))).toBe(true);
    expect(existsSync(resolve(appDir, 'vite.config.ts'))).toBe(true);
    expect(existsSync(resolve(appDir, 'tsconfig.json'))).toBe(true);
    expect(existsSync(resolve(appDir, 'backend/src'))).toBe(true);
    expect(existsSync(resolve(appDir, 'tests'))).toBe(false);
    expect(existsSync(resolve(appDir, 'docs'))).toBe(false);
    expect(existsSync(resolve(appDir, 'node_modules'))).toBe(false);
    expect(existsSync(resolve(appDir, 'backend/tests'))).toBe(false);
    expect(existsSync(resolve(appDir, 'backend/node_modules'))).toBe(false);
  });
});
