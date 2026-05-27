import { spawn } from 'node:child_process';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error instanceof Error && 'code' in error && error.code === 'EPERM';
  }
}

async function waitForProcessExit(pid: number, timeoutMs = 20000): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (!isProcessAlive(pid)) return;
    await sleep(250);
  }
}

async function main() {
  const [oldPidRaw, serverEntryPath] = process.argv.slice(2);
  const oldPid = Number(oldPidRaw);

  if (!serverEntryPath) {
    process.exit(1);
    return;
  }

  await waitForProcessExit(oldPid);

  const child = spawn(process.execPath, ['--experimental-strip-types', serverEntryPath], {
    cwd: process.cwd(),
    detached: true,
    env: process.env,
    stdio: 'ignore',
    windowsHide: true,
  });

  child.unref();
}

void main().catch(() => {
  process.exit(1);
});
