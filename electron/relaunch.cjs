const fs = require('node:fs');
const path = require('node:path');

function resolvePortableRelaunchPath({ platform, isPackaged, portableExecutableFile, exists = fs.existsSync }) {
  if (platform !== 'win32' || !isPackaged || !portableExecutableFile) {
    return null;
  }
  const pathModule = platform === 'win32' ? path.win32 : path;
  if (!pathModule.isAbsolute(portableExecutableFile) || !exists(portableExecutableFile)) {
    return null;
  }
  return portableExecutableFile;
}

function buildRelaunchOptions(options) {
  const portableRelaunchPath = resolvePortableRelaunchPath(options);
  return portableRelaunchPath ? { execPath: portableRelaunchPath } : undefined;
}

module.exports = {
  buildRelaunchOptions,
  resolvePortableRelaunchPath,
};
