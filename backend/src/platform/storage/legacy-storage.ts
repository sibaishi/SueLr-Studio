import fs, { type Dirent } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureDir } from './ensure-dir.js';
import { STORAGE_PATHS, ensureStorageDirectories } from './index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BACKEND_ROOT = path.resolve(__dirname, '../../..');
const PROJECT_ROOT = path.resolve(BACKEND_ROOT, '..');

export const LEGACY_PATHS = {
  backendStorageDir: path.join(BACKEND_ROOT, 'storage'),
  backendSettingsFile: path.join(BACKEND_ROOT, 'storage', 'settings.json'),
  backendAssistantDir: path.join(BACKEND_ROOT, 'storage', 'assistant'),
  backendAssistantSettingsFile: path.join(BACKEND_ROOT, 'storage', 'assistant', 'settings.json'),
  backendAssistantFilesDir: path.join(BACKEND_ROOT, 'storage', 'assistant', 'files'),
  backendUploadsDir: path.join(BACKEND_ROOT, 'storage', 'uploads'),
  backendOutputsDir: path.join(BACKEND_ROOT, 'storage', 'outputs'),
  projectWorkflowsDir: path.join(PROJECT_ROOT, 'workflows'),
  projectOutputsDir: path.join(PROJECT_ROOT, 'outputs'),
};

function copyFileIfMissing(source: string, target: string): void {
  if (!fs.existsSync(source) || fs.existsSync(target)) return;
  ensureDir(path.dirname(target));
  fs.copyFileSync(source, target);
}

function copyJsonWorkflowFilesIfMissing(sourceDir: string, targetDir: string): void {
  if (!fs.existsSync(sourceDir)) return;
  ensureDir(targetDir);
  for (const entry of fs.readdirSync(sourceDir)) {
    if (!entry.endsWith('.json')) continue;
    copyFileIfMissing(path.join(sourceDir, entry), path.join(targetDir, entry));
  }
}

function copyDirectoryFilesIfMissing(sourceDir: string, targetDir: string): void {
  if (!fs.existsSync(sourceDir)) return;
  ensureDir(targetDir);
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true }) as Dirent[]) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      copyDirectoryFilesIfMissing(sourcePath, targetPath);
      continue;
    }
    copyFileIfMissing(sourcePath, targetPath);
  }
}

export function migrateLegacyStorageIfNeeded(): void {
  if (process.env.APP_DISABLE_LEGACY_STORAGE_MIGRATION === '1') {
    return;
  }
  ensureStorageDirectories();
  copyJsonWorkflowFilesIfMissing(LEGACY_PATHS.projectWorkflowsDir, STORAGE_PATHS.workflowsDir);
  copyFileIfMissing(path.join(LEGACY_PATHS.backendAssistantDir, 'conversations.json'), STORAGE_PATHS.conversationsFile);
  copyFileIfMissing(path.join(LEGACY_PATHS.backendAssistantDir, 'gallery.json'), STORAGE_PATHS.galleryFile);
  copyFileIfMissing(path.join(LEGACY_PATHS.backendAssistantDir, 'videos.json'), STORAGE_PATHS.videosFile);
  copyDirectoryFilesIfMissing(
    path.join(LEGACY_PATHS.backendAssistantFilesDir, 'images'),
    path.join(STORAGE_PATHS.generatedDir, 'assistant-images'),
  );
  copyDirectoryFilesIfMissing(LEGACY_PATHS.backendUploadsDir, STORAGE_PATHS.uploadsDir);
  copyDirectoryFilesIfMissing(LEGACY_PATHS.backendOutputsDir, STORAGE_PATHS.generatedDir);
  copyDirectoryFilesIfMissing(LEGACY_PATHS.projectOutputsDir, STORAGE_PATHS.generatedDir);
}
