const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

async function getStoragePaths(resolveAppPath) {
  const storageModuleUrl = pathToFileURL(resolveAppPath('backend', 'src', 'platform', 'storage', 'index.ts')).href;
  const { STORAGE_PATHS, ensureStorageDirectories } = await import(storageModuleUrl);
  ensureStorageDirectories();
  return STORAGE_PATHS;
}

function ensureDirectory(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
}

async function openPath(shell, targetPath) {
  const errorMessage = await shell.openPath(targetPath);
  if (errorMessage) {
    console.error(`Failed to open path: ${targetPath}`, errorMessage);
  }
}

async function openDataDirectory({ resolveAppPath, shell }) {
  const storagePaths = await getStoragePaths(resolveAppPath);
  await openPath(shell, ensureDirectory(storagePaths.root));
}

async function openLogsDirectory({ resolveAppPath, shell }) {
  const storagePaths = await getStoragePaths(resolveAppPath);
  await openPath(shell, ensureDirectory(storagePaths.logsDir));
}

module.exports = {
  openDataDirectory,
  openLogsDirectory,
};
