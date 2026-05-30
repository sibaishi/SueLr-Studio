import { getRuntimeMode } from '../../platform/runtime/index.ts';
import { AppError } from '../errors/index.ts';

type NextFunction = (error?: unknown) => void;

interface AdminAccessRequest {
  headers: Record<string, string | string[] | undefined>;
}

export function requireAdminAccess(req: AdminAccessRequest, _res: unknown, next: NextFunction): void {
  const mode = getRuntimeMode();
  const isServerRuntime = mode.startsWith('server');
  if (!isServerRuntime) {
    next();
    return;
  }

  const requiredKey = String(process.env.APP_ADMIN_ACCESS_KEY || '').trim();
  if (!requiredKey) {
    next(new AppError(503, 'ADMIN_ACCESS_NOT_CONFIGURED', '当前部署未配置管理员访问密钥'));
    return;
  }

  const providedKey = String(req.headers['x-admin-access-key'] || '').trim();
  if (providedKey !== requiredKey) {
    next(new AppError(403, 'ADMIN_ACCESS_DENIED', '管理员访问密钥无效'));
    return;
  }

  next();
}
