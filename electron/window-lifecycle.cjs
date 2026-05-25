const WINDOW_OPTIONS = {
  width: 1280,
  height: 820,
  minWidth: 1024,
  minHeight: 680,
  title: 'SueLr Studio',
  backgroundColor: '#0f172a',
};

function createMainWindow({
  BrowserWindow,
  shell,
  url,
  iconPath,
}) {
  const window = new BrowserWindow({
    ...WINDOW_OPTIONS,
    icon: iconPath,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
    shell.openExternal(targetUrl);
    return { action: 'deny' };
  });

  window.loadURL(url);
  return window;
}

function focusWindow(window) {
  if (!window) return false;
  if (typeof window.isMinimized === 'function' && window.isMinimized()) {
    window.restore();
  }
  if (typeof window.focus === 'function') {
    window.focus();
  }
  return true;
}

module.exports = {
  WINDOW_OPTIONS,
  createMainWindow,
  focusWindow,
};
