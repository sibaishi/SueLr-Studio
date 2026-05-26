function buildApplicationMenuTemplate({ appName, platform, onOpenAdmin }) {
  return [
    ...(platform === 'darwin'
      ? [{
          label: appName,
          submenu: [
            { role: 'about' },
            { type: 'separator' },
            { role: 'services' },
            { type: 'separator' },
            { role: 'hide' },
            { role: 'hideOthers' },
            { role: 'unhide' },
            { type: 'separator' },
            { role: 'quit' },
          ],
        }]
      : []),
    {
      label: '文件',
      submenu: [
        platform === 'darwin' ? { role: 'close' } : { role: 'quit' },
      ],
    },
    {
      label: '查看',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: '工具',
      submenu: [
        {
          label: '打开管理端',
          click: onOpenAdmin,
        },
      ],
    },
    {
      label: '窗口',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(platform === 'darwin' ? [{ type: 'separator' }, { role: 'front' }] : []),
      ],
    },
  ];
}

module.exports = {
  buildApplicationMenuTemplate,
};
