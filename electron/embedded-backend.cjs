const { pathToFileURL } = require('node:url');
const net = require('node:net');
const http = require('node:http');
const https = require('node:https');
const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');

const APP_HOST = '127.0.0.1';

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

function findFreePort(host = APP_HOST) {
  return new Promise((resolvePort, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, host, () => {
      const address = probe.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      probe.close(() => resolvePort(port));
    });
  });
}

async function startEmbeddedBackend({
  resolveAppPath,
  relaunchApp,
  host = APP_HOST,
}) {
  const port = await findFreePort(host);
  const adminPort = await findFreePort(host);
  const frontendDist = resolveAppPath('dist');
  const backendEntry = resolveAppPath('backend', 'server.ts');

  process.env.APP_HOST = host;
  process.env.APP_PORT = String(port);
  process.env.APP_FRONTEND_DIST = frontendDist;
  process.env.APP_ALLOWED_ORIGINS = [`http://${host}:${port}`, `http://${host}:${adminPort}`].join(',');
  process.env.APP_EMBEDDED_BACKEND = '1';
  process.env.APP_DESKTOP_RELAUNCH = '1';
  process.env.APP_DESKTOP_RELAUNCH_HOOK = '1';
  globalThis.__SUE_LR_RELAUNCH__ = relaunchApp;

  const { startServer } = await import(pathToFileURL(backendEntry).href);
  const server = startServer(port, host);
  const adminServer = http.createServer(async (req, res) => {
    try {
      if ((req.url || '').startsWith('/api/')) {
        await proxyApiRequest(req, res, `http://${host}:${port}`);
        return;
      }

      const requestPath = req.url && req.url !== '/' ? req.url.split('?')[0] : '/admin.html';
      const normalizedPath = requestPath === '/' ? '/admin.html' : requestPath;
      const targetPath = path.resolve(frontendDist, `.${normalizedPath}`);
      const fallbackPath = path.resolve(frontendDist, 'admin.html');
      const filePath = fs.existsSync(targetPath) ? targetPath : fallbackPath;
      const body = await fsp.readFile(filePath);
      const contentType = filePath.endsWith('.html')
        ? 'text/html; charset=utf-8'
        : filePath.endsWith('.js')
          ? 'text/javascript; charset=utf-8'
          : filePath.endsWith('.css')
            ? 'text/css; charset=utf-8'
            : 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-store' });
      res.end(body);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
    }
  });

  await new Promise((resolveServer, rejectServer) => {
    adminServer.once('error', rejectServer);
    adminServer.listen(adminPort, host, resolveServer);
  });

  return {
    host,
    port,
    server,
    adminPort,
    adminServer,
    url: `http://${host}:${port}`,
    adminUrl: `http://${host}:${adminPort}/admin.html`,
  };
}

module.exports = {
  APP_HOST,
  findFreePort,
  startEmbeddedBackend,
};
