import { NotFoundError, ValidationError } from '../../app/errors/index.ts';
import { type StoredAuthUser, type UserStatus, authRepository } from '../auth/auth.repository.ts';

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
}

export const adminUsersService = new AdminUsersService();
