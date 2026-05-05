import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const systemDir = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(systemDir, '../../..');
const restartTriggerPath = path.join(systemDir, 'restart-trigger.js');
const restartRunnerPath = path.join(systemDir, 'restart-runner.js');
const serverEntryPath = path.join(backendRoot, 'server.js');

function isWatchMode() {
  return process.execArgv.some((arg) => arg === '--watch' || arg.startsWith('--watch='));
}

async function triggerWatchRestart() {
  await fs.writeFile(restartTriggerPath, `export const RESTART_TRIGGER = ${Date.now()};\n`, 'utf8');
  return { mode: 'watch' };
}

function spawnReplacementServer() {
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

export async function scheduleBackendRestart() {
  if (isWatchMode()) {
    return triggerWatchRestart();
  }
  return spawnReplacementServer();
}
