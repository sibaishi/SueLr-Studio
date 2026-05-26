#!/usr/bin/env node
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
  startProcess,
  waitForHttp,
} from './local-web-common.mjs';

const preferredFrontendPort = Number(process.env.FRONTEND_PORT || process.env.VITE_PORT || 5173);
const preferredAdminPort = Number(process.env.ADMIN_PORT || 5174);
const preferredBackendPort = Number(process.env.APP_PORT || process.env.PORT || 3001);
const selfTest = process.argv.includes('--self-test') || process.env.SUE_LR_START_SELF_TEST === '1';
const noBrowser = selfTest || process.env.SUE_LR_NO_BROWSER === '1';
const runId = new Date().toISOString().replace(/[:.]/g, '-');

async function main() {
  const defaultHost = getDefaultHost();
  print('');
  print('SueLr Studio Local-Web Dev');
  print('==========================');

  ensureNodeVersion();
  ensureLogDir();
  await ensureDependencies();

  const frontendPort = await findPort(preferredFrontendPort);
  const adminPort = await findPort(preferredAdminPort);
  const backendPort = await findPort(preferredBackendPort);
  const frontendUrl = `http://localhost:${frontendPort}`;
  const adminUrl = `http://localhost:${adminPort}`;
  const backendUrl = `http://${defaultHost}:${backendPort}`;
  const allowedOrigins = buildAllowedOrigins(frontendPort);
  const backendLog = resolve(logDir, `backend-local-web-dev-${runId}.log`);
  const frontendLog = resolve(logDir, `frontend-local-web-dev-${runId}.log`);
  const adminLog = resolve(logDir, `admin-local-web-dev-${runId}.log`);
  const viteEntry = resolve(rootDir, 'node_modules', 'vite', 'bin', 'vite.js');

  print('');
  print(`[mode] local-web dev`);
  print(`[start] Frontend: ${frontendUrl}`);
  print(`[start] Admin:    ${adminUrl}`);
  print(`[start] Backend:  ${backendUrl}`);
  print(`[logs]  ${logDir}`);
  print('');

  startProcess(
    'backend',
    process.execPath,
    selfTest ? ['server.js'] : ['--watch', 'server.js'],
    backendDir,
    {
      APP_HOST: defaultHost,
      APP_PORT: String(backendPort),
      APP_ALLOWED_ORIGINS: allowedOrigins,
      APP_RUNTIME_MODE: 'local-web',
    },
    backendLog,
  );

  await waitForHttp(`${backendUrl}/api/health`).catch((error) => {
    fail(`Backend did not become healthy: ${error.message}`);
  });

  startProcess(
    'frontend',
    process.execPath,
    [viteEntry, '--host', defaultHost, '--port', String(frontendPort), '--open', 'index.html'],
    rootDir,
    {
      VITE_DEV_PROXY_TARGET: backendUrl,
      VITE_API_BASE: '/api',
    },
    frontendLog,
  );

  startProcess(
    'admin',
    process.execPath,
    [viteEntry, '--host', defaultHost, '--port', String(adminPort), '--open', 'admin.html'],
    rootDir,
    {
      VITE_DEV_PROXY_TARGET: backendUrl,
      VITE_API_BASE: '/api',
    },
    adminLog,
  );

  await waitForHttp(frontendUrl).catch((error) => {
    fail(`Frontend did not become available: ${error.message}`);
  });
  await waitForHttp(adminUrl).catch((error) => {
    fail(`Admin frontend did not become available: ${error.message}`);
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
  print('[ready] Press Ctrl+C to stop frontend, admin frontend, and backend.');

  if (selfTest) {
    setTimeout(() => process.exit(0), 500);
  }
}

main().catch((error) => {
  fail(error?.message || String(error));
});
