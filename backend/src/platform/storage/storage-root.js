import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BACKEND_ROOT = path.resolve(__dirname, '../../..');
const PROJECT_ROOT = path.resolve(BACKEND_ROOT, '..');
const APP_CONFIG_DIR_NAME = 'SueLr-Studio';

export { BACKEND_ROOT, PROJECT_ROOT, APP_CONFIG_DIR_NAME };

export function getDefaultConfigRoot() {
  const homeDir = os.homedir();
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || path.join(homeDir, 'AppData', 'Roaming'), APP_CONFIG_DIR_NAME);
  }
  if (process.platform === 'darwin') {
    return path.join(homeDir, 'Library', 'Application Support', APP_CONFIG_DIR_NAME);
  }
  return path.join(process.env.XDG_CONFIG_HOME || path.join(homeDir, '.config'), APP_CONFIG_DIR_NAME);
}

export function getStorageRoot() {
  if (process.env.APP_CONFIG_DIR) {
    return path.resolve(process.env.APP_CONFIG_DIR);
  }
  if (process.env.APP_STORAGE_DIR) {
    return path.resolve(PROJECT_ROOT, process.env.APP_STORAGE_DIR);
  }
  return getDefaultConfigRoot();
}
