import path from 'path';
import { getStorageRoot } from './storage-root.js';

export function getStoragePaths() {
  const root = getStorageRoot();
  return {
    root,
    configDir: path.join(root, 'config'),
    settingsFile: path.join(root, 'config', 'settings.json'),
    workflowsDir: path.join(root, 'workflows'),
    assistantDir: path.join(root, 'assistant'),
    conversationsFile: path.join(root, 'assistant', 'conversations.json'),
    galleryFile: path.join(root, 'assistant', 'gallery.json'),
    videosFile: path.join(root, 'assistant', 'videos.json'),
    filesDir: path.join(root, 'files'),
    uploadsDir: path.join(root, 'files', 'uploads'),
    generatedDir: path.join(root, 'files', 'generated'),
    logsDir: path.join(root, 'logs'),
    appLogsDir: path.join(root, 'logs', 'app'),
    workflowRunsDir: path.join(root, 'logs', 'workflow-runs'),
  };
}
