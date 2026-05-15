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
    agentDir: path.join(root, 'agent'),
    agentProfilesFile: path.join(root, 'agent', 'profiles.json'),
    agentMemoriesFile: path.join(root, 'agent', 'memories.json'),
    agentSessionsDir: path.join(root, 'agent', 'sessions'),
    agentLogsDir: path.join(root, 'agent', 'logs'),
    filesDir: path.join(root, 'files'),
    uploadsDir: path.join(root, 'files', 'uploads'),
    generatedDir: path.join(root, 'files', 'generated'),
    logsDir: path.join(root, 'logs'),
    appLogsDir: path.join(root, 'logs', 'app'),
    workflowRunsDir: path.join(root, 'logs', 'workflow-runs'),
  };
}
