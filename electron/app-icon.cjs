function createAppIconController({ dock, getWindow, platform, resolveAppPath }) {
  const icons = {
    dark: resolveAppPath('build', 'icon.png'),
    light: resolveAppPath('build', 'icon-light.png'),
  };

  return {
    initialIconPath: platform === 'win32' ? resolveAppPath('build', 'icon.ico') : icons.dark,
    handleTheme(origin) {
      return (event, theme) => {
        if (theme !== 'light' && theme !== 'dark') return;

        const window = getWindow();
        if (!window || window.isDestroyed() || event.sender !== window.webContents) return;

        const frame = event.senderFrame;
        if (!frame || frame !== window.webContents.mainFrame || frame.origin !== origin) return;

        if (platform === 'darwin') {
          dock?.setIcon(icons[theme]);
        } else if (platform === 'win32' || platform === 'linux') {
          window.setIcon(icons[theme]);
        }
      };
    },
  };
}

module.exports = { createAppIconController };
