import fs from 'node:fs';
import path from 'node:path';
import { NotFoundError, ValidationError } from '../../app/errors/index.ts';
import { STORAGE_PATHS, ensureStorageDirectories, readJsonFile, writeJsonFile } from '../../platform/storage/index.ts';
import { createStorageNamespace, ensureScopedStorageDirectories } from '../../platform/storage/scoped-storage.ts';
import { authRepository } from '../auth/auth.repository.ts';
import type { DynamicValue, PlainObject } from '../types.ts';

type LegacyCategory =
  | 'workflows'
  | 'conversations'
  | 'gallery'
  | 'videos'
  | 'agentMemories'
  | 'generatedFiles'
  | 'uploads';

const JSON_CATEGORIES: Array<{ key: LegacyCategory; filePath: () => string }> = [
  { key: 'conversations', filePath: () => STORAGE_PATHS.conversationsFile },
  { key: 'gallery', filePath: () => STORAGE_PATHS.galleryFile },
  { key: 'videos', filePath: () => STORAGE_PATHS.videosFile },
  { key: 'agentMemories', filePath: () => STORAGE_PATHS.agentMemoriesFile },
];

function isPlainObject(value: DynamicValue): value is PlainObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isUnownedRecord(value: DynamicValue): boolean {
  if (!isPlainObject(value)) return false;
  return !value.ownerUserId && !value.workspaceId && !value.ownershipScope;
}

function isUnownedPlainObject(value: DynamicValue): value is PlainObject {
  return isPlainObject(value) && isUnownedRecord(value);
}

function countFiles(root: string): number {
  if (!fs.existsSync(root)) return 0;
  let count = 0;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '.thumbnails') continue;
      count += countFiles(entryPath);
    } else if (entry.isFile()) {
      count += 1;
    }
  }
  return count;
}

function listFiles(root: string): string[] {
  if (!fs.existsSync(root)) return [];
  const files: string[] = [];
  const visit = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '.thumbnails') continue;
        visit(entryPath);
      } else if (entry.isFile()) {
        files.push(path.relative(root, entryPath).split(path.sep).join('/'));
      }
    }
  };
  visit(root);
  return files;
}

function ensureUniqueDestination(destinationPath: string): string {
  if (!fs.existsSync(destinationPath)) return destinationPath;
  const parsed = path.parse(destinationPath);
  return path.join(parsed.dir, `${parsed.name}_${Date.now()}${parsed.ext}`);
}

function moveDirectoryContents(sourceRoot: string, destinationRoot: string) {
  const moved: Array<{ from: string; to: string }> = [];
  for (const relativePath of listFiles(sourceRoot)) {
    const from = path.join(sourceRoot, ...relativePath.split('/'));
    const to = ensureUniqueDestination(path.join(destinationRoot, ...relativePath.split('/')));
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.renameSync(from, to);
    moved.push({ from, to });
  }
  return moved;
}

function buildOwnership(user: { id: string; workspaceId?: string }) {
  const scope = {
    userId: user.id,
    workspaceId: user.workspaceId || 'default',
    runtimeMode: 'server-multi-user',
  };
  return {
    ownerUserId: scope.userId,
    workspaceId: scope.workspaceId,
    ownershipScope: scope,
  };
}

export class LegacyMigrationService {
  getSummary() {
    ensureStorageDirectories();
    const workflows = fs.existsSync(STORAGE_PATHS.workflowsDir)
      ? fs
          .readdirSync(STORAGE_PATHS.workflowsDir)
          .filter((file) => file.endsWith('.json'))
          .map((file) => readJsonFile(path.join(STORAGE_PATHS.workflowsDir, file), null))
          .filter(isUnownedRecord).length
      : 0;
    const jsonCounts = Object.fromEntries(
      JSON_CATEGORIES.map(({ key, filePath }) => {
        const records = readJsonFile(filePath(), []) as DynamicValue[];
        return [key, Array.isArray(records) ? records.filter(isUnownedRecord).length : 0];
      }),
    );
    return {
      counts: {
        workflows,
        ...jsonCounts,
        generatedFiles: countFiles(STORAGE_PATHS.generatedDir),
        uploads: countFiles(STORAGE_PATHS.uploadsDir),
      } as Record<LegacyCategory, number>,
    };
  }

  dryRun(input: PlainObject = {}) {
    const targetUser = this.resolveTargetUser(input.targetUserId);
    const namespace = createStorageNamespace({
      userId: targetUser.id,
      workspaceId: targetUser.workspaceId,
      runtimeMode: 'server-multi-user',
    });
    return {
      targetUser: {
        id: targetUser.id,
        username: targetUser.username,
        workspaceId: targetUser.workspaceId,
      },
      destinationNamespace: namespace.namespacePath,
      ...this.getSummary(),
    };
  }

  migrate(input: PlainObject = {}) {
    const targetUser = this.resolveTargetUser(input.targetUserId);
    const ownership = buildOwnership(targetUser);
    const scopedPaths = ensureScopedStorageDirectories(ownership.ownershipScope);
    const manifest: PlainObject = {
      id: `legacy-migration-${Date.now()}`,
      createdAt: Date.now(),
      targetUser: {
        id: targetUser.id,
        username: targetUser.username,
        workspaceId: targetUser.workspaceId,
      },
      countsBefore: this.getSummary().counts,
      updatedRecords: {},
      movedFiles: {},
    };

    manifest.updatedRecords.workflows = this.migrateWorkflowRecords(ownership);
    for (const { key, filePath } of JSON_CATEGORIES) {
      manifest.updatedRecords[key] = this.migrateJsonArray(filePath(), ownership);
    }
    manifest.movedFiles.generatedFiles = moveDirectoryContents(STORAGE_PATHS.generatedDir, scopedPaths.generatedDir);
    manifest.movedFiles.uploads = moveDirectoryContents(STORAGE_PATHS.uploadsDir, scopedPaths.uploadsDir);

    const manifestPath = path.join(STORAGE_PATHS.logsDir, 'legacy-migration-manifests', `${manifest.id}.json`);
    writeJsonFile(manifestPath, manifest);
    return {
      manifestPath,
      manifest,
      countsAfter: this.getSummary().counts,
    };
  }

  private resolveTargetUser(userId: DynamicValue) {
    const id = String(userId || '').trim();
    if (!id) throw new ValidationError('LEGACY_MIGRATION_TARGET_REQUIRED', 'targetUserId is required');
    const user = authRepository.findUserById(id);
    if (!user) throw new NotFoundError('LEGACY_MIGRATION_TARGET_NOT_FOUND', '目标用户不存在');
    if (user.status !== 'active') throw new ValidationError('LEGACY_MIGRATION_TARGET_INACTIVE', '目标用户必须已启用');
    return user;
  }

  private migrateWorkflowRecords(ownership: PlainObject) {
    if (!fs.existsSync(STORAGE_PATHS.workflowsDir)) return 0;
    let updated = 0;
    for (const file of fs.readdirSync(STORAGE_PATHS.workflowsDir).filter((item) => item.endsWith('.json'))) {
      const filePath = path.join(STORAGE_PATHS.workflowsDir, file);
      const record = readJsonFile(filePath, null);
      if (!isUnownedPlainObject(record)) continue;
      writeJsonFile(filePath, Object.assign({}, record, ownership));
      updated += 1;
    }
    return updated;
  }

  private migrateJsonArray(filePath: string, ownership: PlainObject) {
    const records = readJsonFile(filePath, []) as DynamicValue[];
    if (!Array.isArray(records)) return 0;
    let updated = 0;
    const next = records.map((record) => {
      if (!isUnownedRecord(record)) return record;
      updated += 1;
      return { ...record, ...ownership };
    });
    if (updated > 0) writeJsonFile(filePath, next);
    return updated;
  }
}

export const legacyMigrationService = new LegacyMigrationService();
