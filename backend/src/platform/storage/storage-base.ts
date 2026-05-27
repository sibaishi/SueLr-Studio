import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BACKEND_ROOT = path.resolve(__dirname, '../../..');
const PROJECT_ROOT = path.resolve(BACKEND_ROOT, '..');
const APP_CONFIG_DIR_NAME = 'SueLr-Studio';

function getDefaultConfigRoot() {
  const homeDir = os.homedir();
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || path.join(homeDir, 'AppData', 'Roaming'), APP_CONFIG_DIR_NAME);
  }
  if (process.platform === 'darwin') {
    return path.join(homeDir, 'Library', 'Application Support', APP_CONFIG_DIR_NAME);
  }
  return path.join(process.env.XDG_CONFIG_HOME || path.join(homeDir, '.config'), APP_CONFIG_DIR_NAME);
}

export { APP_CONFIG_DIR_NAME, BACKEND_ROOT, PROJECT_ROOT, getDefaultConfigRoot };
