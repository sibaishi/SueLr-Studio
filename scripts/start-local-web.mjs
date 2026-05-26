#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  backendDir,
  buildAllowedOrigins,
  ensureDependencies,
  ensureLogDir,
  ensureNodeVersion,
  fail,
  findPort,
  getDefaultHost,
  logDir,
  openBrowser,
  print,
  rootDir,
  runNpmChecked,
  startStaticSite,
  shutdown,
  startProcess,
  waitForHttp,
} from './local-web-common.mjs';

const preferredBackendPort = Number(process.env.APP_PORT || process.env.PORT || 3001);
const preferredAdminPort = Number(process.env.ADMIN_PORT || 3002);
const skipBuild = process.argv.includes('--skip-build');
const selfTest = process.argv.includes('--self-test') || process.env.SUE_LR_START_SELF_TEST === '1';
const noBrowser = selfTest || process.env.SUE_LR_NO_BROWSER === '1';
const runId = new Date().toISOString().replace(/[:.]/g, '-');

async function main() {
  const defaultHost = getDefaultHost();
  const distDir = resolve(rootDir, 'dist');
  const indexHtml = resolve(distDir, 'index.html');
  const adminHtml = resolve(distDir, 'admin.html');

  print('');
  print('SueLr Studio Local-Web');
  print('======================');

  ensureNodeVersion();
  ensureLogDir();
  await ensureDependencies();

  if (!skipBuild || !existsSync(indexHtml)) {
    await runNpmChecked(['run', 'build:local-web'], { cwd: rootDir });
  }

  if (!existsSync(indexHtml) || !existsSync(adminHtml)) {
    fail(`Missing built frontend entry: ${indexHtml}`);
  }

  const backendPort = await findPort(preferredBackendPort);
  const adminPort = await findPort(preferredAdminPort);
  const frontendUrl = `http://localhost:${backendPort}`;
  const adminUrl = `http://localhost:${adminPort}/admin.html`;
  const backendUrl = `http://${defaultHost}:${backendPort}`;
  const allowedOrigins = buildAllowedOrigins(backendPort);
  const backendLog = resolve(logDir, `backend-local-web-${runId}.log`);

  print('');
  print(`[mode] local-web start`);
  print(`[start] Frontend: ${frontendUrl}`);
  print(`[start] Admin:    ${adminUrl}`);
  print(`[start] Backend:  ${backendUrl}`);
  print(`[dist]  ${distDir}`);
  print(`[logs]  ${logDir}`);
  print('');

  startProcess(
    'backend',
    process.execPath,
    ['server.js'],
    backendDir,
    {
      APP_HOST: defaultHost,
      APP_PORT: String(backendPort),
      APP_ALLOWED_ORIGINS: allowedOrigins,
      APP_FRONTEND_DIST: distDir,
      APP_RUNTIME_MODE: 'local-web',
    },
    backendLog,
  );

  await waitForHttp(`${backendUrl}/api/health`).catch((error) => {
    fail(`Backend did not become healthy: ${error.message}`);
  });

  await startStaticSite('admin', distDir, adminPort, defaultHost);

  await waitForHttp(frontendUrl).catch((error) => {
    fail(`Local-web frontend did not become available: ${error.message}`);
  });
  await waitForHttp(adminUrl).catch((error) => {
    fail(`Local-web admin frontend did not become available: ${error.message}`);
  });

  if (noBrowser) {
    print(`[ready] ${frontendUrl}`);
    print(`[ready] ${adminUrl}`);
  } else {
    openBrowser(frontendUrl);
    openBrowser(adminUrl);
    print(`[ready] Opened ${frontendUrl}`);
    print(`[ready] Opened ${adminUrl}`);
  }
  print('[ready] Press Ctrl+C to stop the local-web backend and admin site.');

  if (selfTest) {
    setTimeout(() => shutdown(0), 500);
  }
}

main().catch((error) => {
  fail(error?.message || String(error));
});
