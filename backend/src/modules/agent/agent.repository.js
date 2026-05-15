import fs from 'fs';
import path from 'path';
import { ensureJsonFile, ensureStorageDirectories, readJsonFile, safeResolveWithin, writeJsonFile, STORAGE_PATHS } from '../../platform/storage/index.js';

const DEFAULT_PROFILES = [];
const DEFAULT_MEMORIES = [];
const DEFAULT_SESSIONS = {};

function ensureAgentStorage() {
  ensureStorageDirectories();
  ensureJsonFile(STORAGE_PATHS.agentProfilesFile, DEFAULT_PROFILES);
  ensureJsonFile(STORAGE_PATHS.agentMemoriesFile, DEFAULT_MEMORIES);
  ensureJsonFile(path.join(STORAGE_PATHS.agentDir, 'sessions.json'), DEFAULT_SESSIONS);
}

export class AgentRepository {
  constructor() {
    ensureAgentStorage();
  }

  loadProfiles() {
    return readJsonFile(STORAGE_PATHS.agentProfilesFile, DEFAULT_PROFILES);
  }

  saveProfiles(profiles) {
    writeJsonFile(STORAGE_PATHS.agentProfilesFile, profiles);
  }

  loadMemories() {
    return readJsonFile(STORAGE_PATHS.agentMemoriesFile, DEFAULT_MEMORIES);
  }

  saveMemories(memories) {
    writeJsonFile(STORAGE_PATHS.agentMemoriesFile, memories);
  }

  loadSessions() {
    return readJsonFile(path.join(STORAGE_PATHS.agentDir, 'sessions.json'), DEFAULT_SESSIONS);
  }

  saveSessions(sessions) {
    writeJsonFile(path.join(STORAGE_PATHS.agentDir, 'sessions.json'), sessions);
  }

  readSessionFile(sessionId) {
    const filePath = safeResolveWithin(STORAGE_PATHS.agentSessionsDir, `${sessionId}.json`);
    if (!filePath || !fs.existsSync(filePath)) return null;
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
      return null;
    }
  }

  writeSessionFile(sessionId, value) {
    const filePath = safeResolveWithin(STORAGE_PATHS.agentSessionsDir, `${sessionId}.json`);
    if (!filePath) return null;
    fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8');
    return filePath;
  }

  deleteSessionFile(sessionId) {
    const filePath = safeResolveWithin(STORAGE_PATHS.agentSessionsDir, `${sessionId}.json`);
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
}

export const agentRepository = new AgentRepository();
