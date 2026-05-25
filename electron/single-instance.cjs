function setupSingleInstance(app, focusMainWindow) {
  const hasLock = app.requestSingleInstanceLock();

  if (!hasLock) {
    app.quit();
    return { hasLock };
  }

  app.on('second-instance', () => {
    focusMainWindow();
  });

  return { hasLock };
}

module.exports = {
  setupSingleInstance,
};
