import fs from 'node:fs';
import path from 'node:path';
import {
  STORAGE_PATHS,
  ensureJsonFile,
  ensureStorageDirectories,
  readJsonFile,
  safeResolveWithin,
  writeJsonFile,
} from '../../platform/storage/index.js';
import type { DynamicValue, PlainObject } from '../types.js';

const DEFAULT_PROFILES: DynamicValue[] = [];
const DEFAULT_MEMORIES: DynamicValue[] = [];
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

  loadProfiles(): DynamicValue[] {
    return readJsonFile(STORAGE_PATHS.agentProfilesFile, DEFAULT_PROFILES);
  }

  saveProfiles(profiles: DynamicValue[]) {
    writeJsonFile(STORAGE_PATHS.agentProfilesFile, profiles);
  }

  loadMemories(): DynamicValue[] {
    return readJsonFile(STORAGE_PATHS.agentMemoriesFile, DEFAULT_MEMORIES);
  }

  saveMemories(memories: DynamicValue[]) {
    writeJsonFile(STORAGE_PATHS.agentMemoriesFile, memories);
  }

  loadSessions(): PlainObject {
    return readJsonFile(path.join(STORAGE_PATHS.agentDir, 'sessions.json'), DEFAULT_SESSIONS);
  }

  saveSessions(sessions: PlainObject) {
    writeJsonFile(path.join(STORAGE_PATHS.agentDir, 'sessions.json'), sessions);
  }

  readSessionFile(sessionId: string): PlainObject | null {
    const filePath = safeResolveWithin(STORAGE_PATHS.agentSessionsDir, `${sessionId}.json`);
    if (!filePath || !fs.existsSync(filePath)) return null;
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
      return null;
    }
  }

  writeSessionFile(sessionId: string, value: DynamicValue): string | null {
    const filePath = safeResolveWithin(STORAGE_PATHS.agentSessionsDir, `${sessionId}.json`);
    if (!filePath) return null;
    fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8');
    return filePath;
  }

  deleteSessionFile(sessionId: string) {
    const filePath = safeResolveWithin(STORAGE_PATHS.agentSessionsDir, `${sessionId}.json`);
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
}

export const agentRepository = new AgentRepository();
