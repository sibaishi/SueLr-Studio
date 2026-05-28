import { describe, expect, test } from 'vitest';
import { existsSync, readFileSync, rmSync } from 'node:fs';
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
    expect(existsSync(resolve(appDir, '.dockerignore'))).toBe(true);
    expect(existsSync(resolve(appDir, 'scripts/deploy/server-web/Dockerfile'))).toBe(true);
    expect(existsSync(resolve(appDir, 'scripts/deploy/server-web/compose.image.yaml'))).toBe(true);
    expect(existsSync(resolve(appDir, 'scripts/deploy/server-web/build-image.sh'))).toBe(true);
    expect(existsSync(resolve(appDir, 'scripts/deploy/server-web/update-image.sh'))).toBe(true);
    expect(existsSync(resolve(appDir, 'backend/src'))).toBe(true);
    expect(existsSync(resolve(appDir, 'tests'))).toBe(false);
    expect(existsSync(resolve(appDir, 'docs'))).toBe(false);
    expect(existsSync(resolve(appDir, 'node_modules'))).toBe(false);
    expect(existsSync(resolve(appDir, 'backend/tests'))).toBe(false);
    expect(existsSync(resolve(appDir, 'backend/node_modules'))).toBe(false);
  });

  test('routes public app and independent admin console separately', () => {
    const repoRoot = resolve(__dirname, '../..');
    const nginxConfig = readFileSync(resolve(repoRoot, 'scripts/deploy/server-web/studio.suelr.com.nginx.conf'), 'utf8');
    const compose = readFileSync(resolve(repoRoot, 'scripts/deploy/server-web/compose.yaml'), 'utf8');
    const imageCompose = readFileSync(resolve(repoRoot, 'scripts/deploy/server-web/compose.image.yaml'), 'utf8');

    expect(nginxConfig).toContain('server_name studio.suelr.com;');
    expect(nginxConfig).toContain('proxy_pass http://127.0.0.1:3001;');
    expect(nginxConfig).toContain('server_name admin.studio.suelr.com;');
    expect(nginxConfig).toContain('proxy_pass http://127.0.0.1:3002;');

    for (const source of [compose, imageCompose]) {
      expect(source).toContain('APP_ALLOWED_ORIGINS: https://studio.suelr.com,https://admin.studio.suelr.com');
      expect(source).toContain('APP_ADMIN_ACCESS_KEY: change-this-admin-key');
      expect(source).toContain('"127.0.0.1:3002:3002"');
    }
  });
});
