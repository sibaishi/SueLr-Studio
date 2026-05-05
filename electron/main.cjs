const { app, BrowserWindow, shell } = require('electron');
const { pathToFileURL } = require('node:url');
const net = require('node:net');
const path = require('node:path');

let mainWindow = null;
let backendServer = null;
let relaunching = false;

function findFreePort(host = '127.0.0.1') {
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

function resolveAppPath(...segments) {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'app.asar', ...segments);
  }
  return path.join(app.getAppPath(), ...segments);
}

async function startBackend() {
  const host = '127.0.0.1';
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
  globalThis.__SUE_LR_RELAUNCH__ = () => {
    if (relaunching) return;
    relaunching = true;
    app.relaunch();
    app.exit(0);
  };

  const { startServer } = await import(pathToFileURL(backendEntry).href);
  backendServer = startServer(port, host);
  return `http://${host}:${port}`;
}

function createWindow(url) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 680,
    title: 'SueLr Studio',
    icon: resolveAppPath('build', 'icon.ico'),
    backgroundColor: '#0f172a',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
    shell.openExternal(targetUrl);
    return { action: 'deny' };
  });

  mainWindow.loadURL(url);
}

app.whenReady().then(async () => {
  const url = await startBackend();
  createWindow(url);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow(url);
    }
  });
}).catch((error) => {
  console.error(error);
  app.quit();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (backendServer) {
    backendServer.close();
    backendServer = null;
  }
});
