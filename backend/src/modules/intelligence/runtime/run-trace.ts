import fs from 'node:fs';
import path from 'node:path';
import { NotFoundError, ValidationError } from '../../../app/errors/index.ts';
import { ensureDir } from '../../../platform/storage/ensure-dir.ts';
import {
  getScopedStoragePaths,
  readJsonFile,
  safeResolveWithin,
  writeJsonFile,
} from '../../../platform/storage/index.ts';
import type { DynamicValue, PlainObject } from '../../types.ts';

export type IntelligenceRunTrace = {
  id: string;
  status: 'completed' | 'failed';
  mode: string;
  input: string;
  requestedSkills: string[];
  skillResults: DynamicValue[];
  createdAt: number;
  updatedAt: number;
  sourceRuntime: 'local';
};

function createRunId() {
  return `irun_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function ensureRunsDir(scope?: DynamicValue) {
  ensureDir(getScopedStoragePaths(scope).intelligenceRunsDir);
}

function getRunFilePath(id: string, scope?: DynamicValue) {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    throw new ValidationError('INTELLIGENCE_RUN_ID_INVALID', '运行 ID 非法');
  }
  const filePath = safeResolveWithin(getScopedStoragePaths(scope).intelligenceRunsDir, `${id}.json`);
  if (!filePath) throw new ValidationError('INTELLIGENCE_RUN_ID_INVALID', '运行 ID 非法');
  return filePath;
}

export class RunTraceRepository {
  create(input: {
    mode: string;
    requestInput: string;
    requestedSkills: string[];
    skillResults: DynamicValue[];
    scope?: DynamicValue;
  }): IntelligenceRunTrace {
    ensureRunsDir(input.scope);
    const now = Date.now();
    const trace: IntelligenceRunTrace = {
      id: createRunId(),
      status: 'completed',
      mode: input.mode,
      input: input.requestInput,
      requestedSkills: input.requestedSkills,
      skillResults: input.skillResults,
      createdAt: now,
      updatedAt: now,
      sourceRuntime: 'local',
    };
    writeJsonFile(getRunFilePath(trace.id, input.scope), trace);
    return trace;
  }

  read(id: string, scope?: DynamicValue): IntelligenceRunTrace {
    ensureRunsDir(scope);
    const filePath = getRunFilePath(id, scope);
    if (!fs.existsSync(filePath)) {
      throw new NotFoundError('INTELLIGENCE_RUN_NOT_FOUND', '智能运行记录不存在');
    }
    const trace = readJsonFile<IntelligenceRunTrace | null>(filePath, null);
    if (!trace) throw new NotFoundError('INTELLIGENCE_RUN_NOT_FOUND', '智能运行记录不存在');
    return trace;
  }

  list(scope?: DynamicValue): IntelligenceRunTrace[] {
    const storagePaths = getScopedStoragePaths(scope);
    ensureRunsDir(scope);
    return fs
      .readdirSync(storagePaths.intelligenceRunsDir)
      .filter((file) => file.endsWith('.json'))
      .map((file) => readJsonFile<IntelligenceRunTrace | null>(path.join(storagePaths.intelligenceRunsDir, file), null))
      .filter((trace): trace is IntelligenceRunTrace => Boolean(trace));
  }
}

export const runTraceRepository = new RunTraceRepository();
