const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  /**
   * 将 Electron 主窗口带到前台。
   */
  focusWindow: () => {
    ipcRenderer.send('focus:window');
  },
});
