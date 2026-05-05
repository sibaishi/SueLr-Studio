import { spawn } from 'node:child_process';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

async function waitForProcessExit(pid, timeoutMs = 20000) {
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

  const child = spawn(process.execPath, [serverEntryPath], {
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
