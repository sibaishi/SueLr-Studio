const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('node:path');
const { buildRelaunchOptions } = require('./relaunch.cjs');
const { buildApplicationMenuTemplate } = require('./menu.cjs');
const { setupSingleInstance } = require('./single-instance.cjs');
const { createMainWindow, focusWindow } = require('./window-lifecycle.cjs');
const { startEmbeddedBackend } = require('./embedded-backend.cjs');
const { openDataDirectory, openLogsDirectory } = require('./runtime-paths.cjs');

let mainWindow = null;
let backendServer = null;
let adminServer = null;
let adminUrl = null;
let relaunching = false;
const { hasLock: hasSingleInstanceLock } = setupSingleInstance(app, () => focusMainWindow());

function resolveAppPath(...segments) {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'app.asar', ...segments);
  }
  return path.join(app.getAppPath(), ...segments);
}

function relaunchApp() {
  if (relaunching) return;
  relaunching = true;

  const relaunchOptions = buildRelaunchOptions({
    platform: process.platform,
    isPackaged: app.isPackaged,
    portableExecutableFile: process.env.PORTABLE_EXECUTABLE_FILE,
  });
  if (relaunchOptions) {
    app.relaunch(relaunchOptions);
  } else {
    app.relaunch();
  }
  app.exit(0);
}

function createWindow(url) {
  mainWindow = createMainWindow({
    BrowserWindow,
    shell,
    url,
    iconPath: resolveAppPath('build', 'icon.ico'),
  });
}

function focusMainWindow() {
  focusWindow(mainWindow);
}

function installApplicationMenu() {
  const template = buildApplicationMenuTemplate({
    appName: app.name,
    platform: process.platform,
    onOpenAdmin: () => {
      if (adminUrl) {
        void shell.openExternal(adminUrl);
      }
    },
    onOpenDataDirectory: () => {
      void openDataDirectory({ resolveAppPath, shell });
    },
    onOpenLogsDirectory: () => {
      void openLogsDirectory({ resolveAppPath, shell });
    },
    onRelaunch: relaunchApp,
  });

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(async () => {
  if (!hasSingleInstanceLock) return;
  const backend = await startEmbeddedBackend({
    resolveAppPath,
    relaunchApp,
  });
  backendServer = backend.server;
  adminServer = backend.adminServer;
  adminUrl = backend.adminUrl;
  installApplicationMenu();
  createWindow(backend.url);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow(backend.url);
    } else {
      focusMainWindow();
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
  if (adminServer) {
    adminServer.close();
    adminServer = null;
  }
  adminUrl = null;
  if (backendServer) {
    backendServer.close();
    backendServer = null;
  }
});
