import fs from 'node:fs';
import path from 'node:path';
import { NotFoundError, ValidationError } from '../../app/errors/index.ts';
import { auditLog } from '../../platform/audit/audit-log.ts';
import { STORAGE_PATHS, getScopedStoragePaths, readJsonFile, safeResolveWithin, writeJsonFile } from '../../platform/storage/index.ts';
import { type StoredAuthUser, type UserStatus, authRepository } from '../auth/auth.repository.ts';
import type { DynamicValue, PlainObject } from '../types.ts';

const USER_STATUSES = new Set(['pending', 'active', 'rejected', 'disabled']);

function toAdminUser(user: StoredAuthUser) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    status: user.status,
    workspaceId: user.workspaceId || 'default',
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    approvedAt: user.approvedAt,
    rejectedAt: user.rejectedAt,
    disabledAt: user.disabledAt,
  };
}

function isPlainObject(value: DynamicValue): value is PlainObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isOwnedByUser(value: DynamicValue, userId: string): boolean {
  if (!isPlainObject(value)) return false;
  const ownershipScope = isPlainObject(value.ownershipScope) ? value.ownershipScope : undefined;
  const scope = isPlainObject(value.scope) ? value.scope : undefined;
  return value.ownerUserId === userId || ownershipScope?.userId === userId || scope?.userId === userId;
}

function pruneOwnedArrayFile(filePath: string, userId: string): number {
  const current = readJsonFile<DynamicValue>(filePath, []);
  if (!Array.isArray(current)) return 0;
  const next = current.filter((item) => !isOwnedByUser(item, userId));
  if (next.length === current.length) return 0;
  writeJsonFile(filePath, next);
  return current.length - next.length;
}

function pruneOwnedObjectMapFile(filePath: string, userId: string): number {
  const current = readJsonFile<DynamicValue>(filePath, {});
  if (!isPlainObject(current)) return 0;
  let deleted = 0;
  const next: PlainObject = {};
  for (const [key, value] of Object.entries(current)) {
    if (isOwnedByUser(value, userId)) {
      deleted += 1;
    } else {
      next[key] = value;
    }
  }
  if (deleted > 0) writeJsonFile(filePath, next);
  return deleted;
}

function pruneOwnedUploadMetadata(userId: string): number {
  const filePath = path.join(STORAGE_PATHS.filesDir, 'upload-metadata.json');
  const current = readJsonFile<DynamicValue>(filePath, { items: {} });
  if (!isPlainObject(current) || !isPlainObject(current.items)) return 0;
  let deleted = 0;
  const items: PlainObject = {};
  for (const [key, value] of Object.entries(current.items)) {
    if (isOwnedByUser(value, userId)) {
      deleted += 1;
    } else {
      items[key] = value;
    }
  }
  if (deleted > 0) writeJsonFile(filePath, { ...current, items });
  return deleted;
}

function pruneOwnedWorkflowFiles(userId: string): number {
  if (!fs.existsSync(STORAGE_PATHS.workflowsDir)) return 0;
  let deleted = 0;
  for (const entry of fs.readdirSync(STORAGE_PATHS.workflowsDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    const filePath = safeResolveWithin(STORAGE_PATHS.workflowsDir, entry.name);
    if (!filePath) continue;
    const workflow = readJsonFile<DynamicValue>(filePath, null);
    if (!isOwnedByUser(workflow, userId)) continue;
    fs.rmSync(filePath, { force: true });
    deleted += 1;
  }
  return deleted;
}

function pruneOwnedAgentSessionFiles(userId: string): number {
  if (!fs.existsSync(STORAGE_PATHS.agentSessionsDir)) return 0;
  let deleted = 0;
  for (const entry of fs.readdirSync(STORAGE_PATHS.agentSessionsDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    const filePath = safeResolveWithin(STORAGE_PATHS.agentSessionsDir, entry.name);
    if (!filePath) continue;
    const session = readJsonFile<DynamicValue>(filePath, null);
    if (!isOwnedByUser(session, userId)) continue;
    fs.rmSync(filePath, { force: true });
    deleted += 1;
  }
  return deleted;
}

function pruneOwnedLegacyData(userId: string) {
  let records = 0;
  let workflows = pruneOwnedWorkflowFiles(userId);

  for (const filePath of [
    STORAGE_PATHS.conversationsFile,
    STORAGE_PATHS.galleryFile,
    STORAGE_PATHS.videosFile,
    STORAGE_PATHS.agentMemoriesFile,
    STORAGE_PATHS.agentProfilesFile,
  ]) {
    records += pruneOwnedArrayFile(filePath, userId);
  }

  records += pruneOwnedObjectMapFile(path.join(STORAGE_PATHS.agentDir, 'sessions.json'), userId);
  records += pruneOwnedAgentSessionFiles(userId);
  records += pruneOwnedUploadMetadata(userId);

  return { workflows, records };
}

function deleteScopedStorage(user: StoredAuthUser): boolean {
  const scopedPaths = getScopedStoragePaths({
    userId: user.id,
    workspaceId: user.workspaceId || 'default',
    runtimeMode: 'server-multi-user',
  });
  if (!scopedPaths.scopeNamespace.namespacePath) return false;
  if (!fs.existsSync(scopedPaths.root)) return false;
  fs.rmSync(scopedPaths.root, { recursive: true, force: true });
  return true;
}

export class AdminUsersService {
  repository;

  constructor(repository = authRepository) {
    this.repository = repository;
  }

  listUsers(status?: string) {
    const normalizedStatus = String(status || '').trim();
    if (normalizedStatus && !USER_STATUSES.has(normalizedStatus)) {
      throw new ValidationError('ADMIN_USER_STATUS_INVALID', '用户状态无效');
    }

    const users = this.repository
      .listUsers()
      .filter((user) => !normalizedStatus || user.status === normalizedStatus)
      .map(toAdminUser);

    return { users };
  }

  updateStatus(userId: string, status: UserStatus) {
    const user = this.repository.updateUserStatusById(userId, status);
    if (!user) throw new NotFoundError('ADMIN_USER_NOT_FOUND', '用户不存在');
    return { user: toAdminUser(user) };
  }

  deleteUser(userId: string, confirmAccessKey: string) {
    const required = String(process.env.APP_ADMIN_ACCESS_KEY || '').trim();
    const provided = String(confirmAccessKey || '').trim();
    if (!required || provided !== required) {
      throw new ValidationError('ADMIN_DELETE_CONFIRMATION_INVALID', '管理员密钥确认无效');
    }

    const existing = this.repository.findUserById(userId);
    if (!existing) throw new NotFoundError('ADMIN_USER_NOT_FOUND', '用户不存在');
    if (existing.status === 'active') {
      throw new ValidationError('ADMIN_ACTIVE_USER_DELETE_FORBIDDEN', '启用用户不能删除，请先停用');
    }

    const legacyDeleted = pruneOwnedLegacyData(existing.id);
    const scopedStorageDeleted = deleteScopedStorage(existing);
    const deletedAuth = this.repository.deleteUserCascade(existing.id);
    const deletedUser = deletedAuth.user || existing;
    const deleted = {
      sessions: deletedAuth.sessionsDeleted,
      passwordResetRequests: deletedAuth.passwordResetRequestsDeleted,
      workflows: legacyDeleted.workflows,
      records: legacyDeleted.records,
      scopedStorage: scopedStorageDeleted,
    };

    auditLog.write({
      action: 'admin.user.deleted',
      actorType: 'admin',
      targetType: 'user',
      targetId: deletedUser.id,
      details: {
        username: deletedUser.username,
        status: deletedUser.status,
        deleted,
      },
    });

    return {
      deletedUser: toAdminUser(deletedUser),
      deleted,
    };
  }
}

export const adminUsersService = new AdminUsersService();
