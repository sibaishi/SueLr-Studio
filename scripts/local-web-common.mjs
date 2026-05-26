import { createWriteStream, existsSync, mkdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const rootDir = resolve(__dirname, '..');
export const backendDir = resolve(rootDir, 'backend');
export const logDir = resolve(rootDir, '.run-logs');
const defaultHost = '127.0.0.1';
const requiredNode = { major: 22, minor: 12, patch: 0 };
const children = new Set();
const servers = new Set();
let shuttingDown = false;

async function readRequestBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return chunks.length > 0 ? Buffer.concat(chunks) : undefined;
}

function buildProxyHeaders(headers) {
  const next = {};
  for (const [key, value] of Object.entries(headers || {})) {
    if (value == null) continue;
    const lower = key.toLowerCase();
    if (lower === 'host' || lower === 'connection' || lower === 'content-length' || lower === 'transfer-encoding') {
      continue;
    }
    next[key] = Array.isArray(value) ? value.map((item) => String(item)).join(', ') : String(value);
  }
  return next;
}

async function proxyApiRequest(req, res, targetBase) {
  const targetUrl = new URL(req.url || '/', targetBase);
  const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : await readRequestBody(req);
  const transport = targetUrl.protocol === 'https:' ? https : http;

  await new Promise((resolvePromise, rejectPromise) => {
    const upstreamReq = transport.request(targetUrl, {
      method: req.method,
      headers: {
        ...buildProxyHeaders(req.headers),
        ...(body ? { 'content-length': String(body.length) } : {}),
      },
    }, (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers);
      upstreamRes.on('data', (chunk) => res.write(chunk));
      upstreamRes.on('end', () => {
        res.end();
        resolvePromise();
      });
    });

    upstreamReq.on('error', rejectPromise);
    if (body) upstreamReq.write(body);
    upstreamReq.end();
  });
}

export function print(message = '') {
  console.log(message);
}

export function fail(message) {
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

export function ensureNodeVersion() {
  const actual = process.versions.node;
  if (compareVersions(actual, requiredNode) < 0) {
    fail(`Node.js ${actual} is too old. SueLr Studio requires Node.js >= 22.12.0.`);
  }
}

export function npmInvocation(args) {
  if (process.platform === 'win32') {
    return { command: 'cmd', args: ['/d', '/s', '/c', 'npm', ...args] };
  }
  return { command: 'npm', args };
}

export function runChecked(command, args, options = {}) {
  const display = [command, ...args].join(' ');
  print(`[setup] ${display}`);
  const result = spawn(command, args, {
    cwd: options.cwd || rootDir,
    env: options.env || process.env,
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

export function runNpmChecked(args, options = {}) {
  const invocation = npmInvocation(args);
  return runChecked(invocation.command, invocation.args, options);
}

export async function ensureDependencies() {
  if (!existsSync(resolve(rootDir, 'node_modules'))) {
    await runNpmChecked(['install'], { cwd: rootDir });
  }

  if (!existsSync(resolve(backendDir, 'node_modules'))) {
    await runNpmChecked(['install'], { cwd: backendDir });
  }
}

export function isPortFree(port, host = defaultHost) {
  return new Promise((resolvePromise) => {
    const server = net.createServer();
    server.once('error', () => resolvePromise(false));
    server.listen(port, host, () => {
      server.close(() => resolvePromise(true));
    });
  });
}

export async function findPort(preferredPort, host = defaultHost) {
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

export function startProcess(name, command, args, cwd, env, logFile) {
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
    if (signal) return;
    if (code !== 0 && !shuttingDown) {
      console.error(`[${name}] exited with code ${code}`);
      shutdown(code || 1);
    }
  });

  return child;
}

export function waitForHttp(url, timeoutMs = 30000) {
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

export function openBrowser(url) {
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

export function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;

  for (const child of children) {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' });
    } else {
      child.kill('SIGTERM');
    }
  }

  for (const server of servers) {
    server.close();
  }

  setTimeout(() => process.exit(code), 300);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

export function buildAllowedOrigins(frontendPort) {
  return [
    `http://localhost:${frontendPort}`,
    `http://${defaultHost}:${frontendPort}`,
    `http://localhost:${frontendPort + 1}`,
    `http://${defaultHost}:${frontendPort + 1}`,
    process.env.APP_ALLOWED_ORIGINS,
  ].filter(Boolean).join(',');
}

export function getDefaultHost() {
  return defaultHost;
}

export function ensureLogDir() {
  mkdirSync(logDir, { recursive: true });
}

export async function startStaticSite(name, rootDirPath, port, host = defaultHost) {
  const server = http.createServer(async (req, res) => {
    try {
      if ((req.url || '').startsWith('/api/')) {
        const targetBase = process.env.APP_STATIC_API_TARGET || `http://${defaultHost}:3001`;
        await proxyApiRequest(req, res, targetBase);
        return;
      }

      const requestPath = req.url && req.url !== '/' ? req.url.split('?')[0] : '/index.html';
      const normalizedPath = requestPath === '/' ? '/index.html' : requestPath;
      const targetPath = resolve(rootDirPath, `.${normalizedPath}`);
      const fallbackPath = resolve(rootDirPath, 'admin.html');
      const filePath = existsSync(targetPath) ? targetPath : fallbackPath;
      const body = await readFile(filePath);
      const contentType = filePath.endsWith('.html')
        ? 'text/html; charset=utf-8'
        : filePath.endsWith('.js')
          ? 'text/javascript; charset=utf-8'
          : filePath.endsWith('.css')
            ? 'text/css; charset=utf-8'
            : 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end('Not Found');
    }
  });

  await new Promise((resolvePromise, reject) => {
    server.listen(port, host, () => resolvePromise());
    server.on('error', reject);
  });

  servers.add(server);
  print(`[${name}] http://${host}:${port}`);
  return server;
}
