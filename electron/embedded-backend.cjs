const { pathToFileURL } = require('node:url');
const net = require('node:net');

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
  const frontendDist = resolveAppPath('dist');
  const backendEntry = resolveAppPath('backend', 'server.js');

  process.env.APP_HOST = host;
  process.env.APP_PORT = String(port);
  process.env.APP_FRONTEND_DIST = frontendDist;
  process.env.APP_ALLOWED_ORIGINS = `http://${host}:${port}`;
  process.env.APP_EMBEDDED_BACKEND = '1';
  process.env.APP_DESKTOP_RELAUNCH = '1';
  process.env.APP_DESKTOP_RELAUNCH_HOOK = '1';
  globalThis.__SUE_LR_RELAUNCH__ = relaunchApp;

  const { startServer } = await import(pathToFileURL(backendEntry).href);
  const server = startServer(port, host);
  return {
    host,
    port,
    server,
    url: `http://${host}:${port}`,
  };
}

module.exports = {
  APP_HOST,
  findFreePort,
  startEmbeddedBackend,
};
