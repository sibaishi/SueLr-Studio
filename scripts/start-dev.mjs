#!/usr/bin/env node
import { createWriteStream, existsSync, mkdirSync } from 'node:fs';
import net from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
const backendDir = resolve(rootDir, 'backend');
const logDir = resolve(rootDir, '.run-logs');
const requiredNode = { major: 22, minor: 12, patch: 0 };
const defaultHost = '127.0.0.1';
const preferredFrontendPort = Number(process.env.FRONTEND_PORT || process.env.VITE_PORT || 5173);
const preferredBackendPort = Number(process.env.APP_PORT || process.env.PORT || 3001);
const selfTest = process.argv.includes('--self-test') || process.env.SUE_LR_START_SELF_TEST === '1';
const noBrowser = selfTest || process.env.SUE_LR_NO_BROWSER === '1';
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const children = new Set();

function print(message = '') {
  console.log(message);
}

function fail(message) {
  console.error(`\n[ERROR] ${message}`);
  if (children.size > 0) {
    shutdown(1);
    return;
  }
  process.exit(1);
}

function compareVersions(actual, required) {
  const [major = 0, minor = 0, patch = 0] = actual.split('.').map(Number);
  if (major !== required.major) return major - required.major;
  if (minor !== required.minor) return minor - required.minor;
  return patch - required.patch;
}

function ensureNodeVersion() {
  const actual = process.versions.node;
  if (compareVersions(actual, requiredNode) < 0) {
    fail(`Node.js ${actual} is too old. SueLr Studio requires Node.js >= 22.12.0.`);
  }
}

function runChecked(command, args, options = {}) {
  const display = [command, ...args].join(' ');
  print(`[setup] ${display}`);
  const result = spawn(command, args, {
    cwd: options.cwd || rootDir,
    env: process.env,
    shell: false,
    stdio: 'inherit',
  });

  return new Promise((resolvePromise, reject) => {
    result.on('error', reject);
    result.on('exit', (code) => {
      if (code === 0) {
        resolvePromise();
      } else {
        reject(new Error(`${display} exited with code ${code}`));
      }
    });
  });
}

function npmInvocation(args) {
  if (process.platform === 'win32') {
    return { command: 'cmd', args: ['/d', '/s', '/c', 'npm', ...args] };
  }

  return { command: 'npm', args };
}

function runNpmChecked(args, options = {}) {
  const invocation = npmInvocation(args);
  return runChecked(invocation.command, invocation.args, options);
}

async function ensureDependencies() {
  if (!existsSync(resolve(rootDir, 'node_modules'))) {
    await runNpmChecked(['install'], { cwd: rootDir });
  }

  if (!existsSync(resolve(backendDir, 'node_modules'))) {
    await runNpmChecked(['install'], { cwd: backendDir });
  }
}

function isPortFree(port, host = defaultHost) {
  return new Promise((resolvePromise) => {
    const server = net.createServer();
    server.once('error', () => resolvePromise(false));
    server.listen(port, host, () => {
      server.close(() => resolvePromise(true));
    });
  });
}

async function findPort(preferredPort, host = defaultHost) {
  for (let port = preferredPort; port < preferredPort + 50; port += 1) {
    if (await isPortFree(port, host)) {
      return port;
    }
  }
  fail(`No free port found from ${preferredPort} to ${preferredPort + 49}.`);
}

function pipeChildOutput(child, name, logFile) {
  const stream = createWriteStream(logFile, { flags: 'a' });
  const prefix = `[${name}]`;

  child.stdout?.on('data', (chunk) => {
    stream.write(chunk);
    process.stdout.write(`${prefix} ${chunk}`);
  });

  child.stderr?.on('data', (chunk) => {
    stream.write(chunk);
    process.stderr.write(`${prefix} ${chunk}`);
  });

  child.on('close', () => stream.end());
}

function startProcess(name, command, args, cwd, env, logFile) {
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, ...env },
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  children.add(child);
  pipeChildOutput(child, name, logFile);

  child.on('exit', (code, signal) => {
    children.delete(child);
    if (signal) {
      return;
    }
    if (code !== 0 && !shuttingDown) {
      console.error(`[${name}] exited with code ${code}`);
      shutdown(code || 1);
    }
  });

  return child;
}

function waitForHttp(url, timeoutMs = 30000) {
  const startedAt = Date.now();
  return new Promise((resolvePromise, reject) => {
    const tick = async () => {
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
        if (response.ok) {
          resolvePromise();
          return;
        }
      } catch {
        // Retry until timeout.
      }

      if (Date.now() - startedAt > timeoutMs) {
        reject(new Error(`Timed out waiting for ${url}`));
        return;
      }

      setTimeout(tick, 500);
    };

    tick();
  });
}

function openBrowser(url) {
  const opener = process.platform === 'win32'
    ? ['cmd', ['/c', 'start', '', url]]
    : process.platform === 'darwin'
      ? ['open', [url]]
      : ['xdg-open', [url]];

  const child = spawn(opener[0], opener[1], {
    detached: true,
    stdio: 'ignore',
    shell: false,
  });
  child.unref();
}

let shuttingDown = false;
function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;

  for (const child of children) {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' });
    } else {
      child.kill('SIGTERM');
    }
  }

  setTimeout(() => process.exit(code), 300);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

async function main() {
  print('');
  print('SueLr Studio');
  print('============');

  ensureNodeVersion();
  mkdirSync(logDir, { recursive: true });
  await ensureDependencies();

  const frontendPort = await findPort(preferredFrontendPort);
  const backendPort = await findPort(preferredBackendPort);
  const frontendUrl = `http://localhost:${frontendPort}`;
  const backendUrl = `http://${defaultHost}:${backendPort}`;
  const allowedOrigins = [
    frontendUrl,
    `http://${defaultHost}:${frontendPort}`,
    process.env.APP_ALLOWED_ORIGINS,
  ].filter(Boolean).join(',');

  print('');
  print(`[start] Frontend: ${frontendUrl}`);
  print(`[start] Backend:  ${backendUrl}`);
  print(`[logs]  ${logDir}`);
  print('');

  const backendLog = resolve(logDir, `backend-dev-${runId}.log`);
  const frontendLog = resolve(logDir, `frontend-dev-${runId}.log`);
  const viteEntry = resolve(rootDir, 'node_modules', 'vite', 'bin', 'vite.js');

  startProcess(
    'backend',
    process.execPath,
    ['--watch', 'server.js'],
    backendDir,
    {
      APP_HOST: defaultHost,
      APP_PORT: String(backendPort),
      APP_ALLOWED_ORIGINS: allowedOrigins,
    },
    backendLog,
  );

  await waitForHttp(`${backendUrl}/api/health`).catch((error) => {
    fail(`Backend did not become healthy: ${error.message}`);
  });

  startProcess(
    'frontend',
    process.execPath,
    [viteEntry, '--host', defaultHost, '--port', String(frontendPort)],
    rootDir,
    {
      VITE_DEV_PROXY_TARGET: backendUrl,
      VITE_API_BASE: '/api',
    },
    frontendLog,
  );

  await waitForHttp(frontendUrl).catch((error) => {
    fail(`Frontend did not become available: ${error.message}`);
  });

  if (noBrowser) {
    print(`[ready] ${frontendUrl}`);
  } else {
    openBrowser(frontendUrl);
    print(`[ready] Opened ${frontendUrl}`);
  }
  print('[ready] Press Ctrl+C to stop frontend and backend.');

  if (selfTest) {
    setTimeout(() => shutdown(0), 500);
  }
}

main().catch((error) => {
  fail(error?.message || String(error));
});
