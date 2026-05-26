const { pathToFileURL } = require('node:url');
const net = require('node:net');
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');

const APP_HOST = '127.0.0.1';

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
  const backendEntry = resolveAppPath('backend', 'server.js');

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
