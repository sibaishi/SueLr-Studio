import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AppError } from '../../app/errors/index.js';
import { getRuntimeCapabilities } from '../runtime/index.js';

type RestartResult =
  | { mode: 'watch' }
  | { mode: 'spawn' }
  | { mode: 'desktop'; restartRequired: true }
  | { mode: 'desktop-relaunch'; restartRequired: true };

declare global {
  // Electron injects this hook when the embedded backend can relaunch the desktop shell.
  // eslint-disable-next-line no-var
  var __SUE_LR_RELAUNCH__: (() => void) | undefined;
}

const systemDir = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(systemDir, '../../..');
const restartTriggerPath = path.join(systemDir, 'restart-trigger.js');
const restartRunnerPath = path.join(systemDir, 'restart-runner.js');
const serverEntryPath = path.join(backendRoot, 'server.js');

function isWatchMode() {
  return process.execArgv.some((arg) => arg === '--watch' || arg.startsWith('--watch='));
}

function isEmbeddedBackend() {
  return process.env.APP_EMBEDDED_BACKEND === '1';
}

function canRelaunchElectronApp() {
  return process.env.APP_DESKTOP_RELAUNCH === '1';
}

function getDesktopRelaunchHook(): (() => void) | undefined {
  return globalThis.__SUE_LR_RELAUNCH__;
}

async function triggerWatchRestart(): Promise<RestartResult> {
  await fs.writeFile(restartTriggerPath, `export const RESTART_TRIGGER = ${Date.now()};\n`, 'utf8');
  return { mode: 'watch' };
}

function scheduleElectronRelaunch(): RestartResult {
  if (process.env.APP_DISABLE_DESKTOP_RELAUNCH === '1') {
    return { mode: 'desktop-relaunch', restartRequired: true };
  }

  setTimeout(async () => {
    try {
      const relaunch = getDesktopRelaunchHook();
      if (typeof relaunch === 'function') {
        relaunch();
        return;
      }
      throw new Error('Desktop relaunch hook is not available');
    } catch (error) {
      console.error(error);
      process.exit(0);
    }
  }, 250);

  return { mode: 'desktop-relaunch', restartRequired: true };
}

function spawnReplacementServer(): RestartResult {
  const child = spawn(process.execPath, [restartRunnerPath, String(process.pid), serverEntryPath], {
    cwd: backendRoot,
    detached: true,
    env: process.env,
    stdio: 'ignore',
    windowsHide: true,
  });

  child.unref();

  setTimeout(() => {
    process.exit(0);
  }, 150);

  return { mode: 'spawn' };
}

export async function scheduleBackendRestart(): Promise<RestartResult> {
  if (!getRuntimeCapabilities().canRestartBackend) {
    throw new AppError(403, 'BACKEND_RESTART_UNAVAILABLE', '当前运行模式不支持重启后端');
  }

  if (isEmbeddedBackend()) {
    if (canRelaunchElectronApp() && process.env.APP_DESKTOP_RELAUNCH_HOOK === '1') {
      return scheduleElectronRelaunch();
    }
    return { mode: 'desktop', restartRequired: true };
  }
  if (isWatchMode()) {
    return triggerWatchRestart();
  }
  return spawnReplacementServer();
}
