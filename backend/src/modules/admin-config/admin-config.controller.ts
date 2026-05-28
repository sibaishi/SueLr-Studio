import { successEnvelope } from '../../app/http/envelope.ts';
import { getRuntimeMode } from '../../platform/runtime/index.ts';
import type { DynamicValue, NextFunctionLike, RequestLike, ResponseLike } from '../types.ts';
import { adminConfigService } from './admin-config.service.ts';
import { adminUsersService } from './admin-users.service.ts';
import { authService } from '../auth/auth.service.ts';
import { legacyMigrationService } from './legacy-migration.service.ts';

export class AdminConfigController {
  getSettings(_req: RequestLike, res: ResponseLike, next: NextFunctionLike) {
    try {
      res.json(successEnvelope(adminConfigService.getAdminConfig()));
    } catch (error) {
      next(error);
    }
  }

  updateSettings(req: RequestLike, res: ResponseLike, next: NextFunctionLike) {
    try {
      res.json(successEnvelope(adminConfigService.updateAdminConfig(req.body)));
    } catch (error) {
      next(error);
    }
  }

  async testSearch(req: RequestLike, res: ResponseLike, next: NextFunctionLike) {
    try {
      const data = (await adminConfigService.testSearch(req.body)) as DynamicValue;
      const results = Array.isArray(data?.results) ? data.results : [];
      res.json(
        successEnvelope({
          message: `搜索连接成功，已返回 ${results.length} 条结果`,
          data,
        }),
      );
    } catch (error) {
      next(error);
    }
  }

  async testEmail(req: RequestLike, res: ResponseLike, next: NextFunctionLike) {
    try {
      res.json(successEnvelope(await adminConfigService.testEmail(req.body)));
    } catch (error) {
      next(error);
    }
  }

  validateAccess(req: RequestLike, res: ResponseLike, next: NextFunctionLike) {
    try {
      const headerKey = String(req.headers?.['x-admin-access-key'] || '').trim();
      const bodyKey = String(req.body?.accessKey || '').trim();
      const provided = headerKey || bodyKey;
      const required = String(process.env.APP_ADMIN_ACCESS_KEY || '').trim();
      const requiresAccessKey = getRuntimeMode().startsWith('server');
      const valid = !requiresAccessKey || (required && provided === required);
      res.json(
        successEnvelope({
          valid,
          requiresAccessKey,
        }),
      );
    } catch (error) {
      next(error);
    }
  }

  listUsers(req: RequestLike, res: ResponseLike, next: NextFunctionLike) {
    try {
      res.json(successEnvelope(adminUsersService.listUsers(String(req.query?.status || ''))));
    } catch (error) {
      next(error);
    }
  }

  async approveUser(req: RequestLike, res: ResponseLike, next: NextFunctionLike) {
    try {
      const data = adminUsersService.updateStatus(String(req.params?.id || ''), 'active');
      const notification = await authService.sendUserApprovedEmail(data.user.id);
      res.json(successEnvelope({ ...data, notification }));
    } catch (error) {
      next(error);
    }
  }

  rejectUser(req: RequestLike, res: ResponseLike, next: NextFunctionLike) {
    try {
      res.json(successEnvelope(adminUsersService.updateStatus(String(req.params?.id || ''), 'rejected')));
    } catch (error) {
      next(error);
    }
  }

  disableUser(req: RequestLike, res: ResponseLike, next: NextFunctionLike) {
    try {
      res.json(successEnvelope(adminUsersService.updateStatus(String(req.params?.id || ''), 'disabled')));
    } catch (error) {
      next(error);
    }
  }

  enableUser(req: RequestLike, res: ResponseLike, next: NextFunctionLike) {
    try {
      res.json(successEnvelope(adminUsersService.updateStatus(String(req.params?.id || ''), 'active')));
    } catch (error) {
      next(error);
    }
  }

  getAudit(_req: RequestLike, res: ResponseLike, next: NextFunctionLike) {
    try {
      res.json(successEnvelope({ entries: [] }));
    } catch (error) {
      next(error);
    }
  }

  listPasswordResetRequests(_req: RequestLike, res: ResponseLike, next: NextFunctionLike) {
    try {
      res.json(successEnvelope(authService.listPasswordResetRequests()));
    } catch (error) {
      next(error);
    }
  }

  async issuePasswordResetRequest(req: RequestLike, res: ResponseLike, next: NextFunctionLike) {
    try {
      res.json(successEnvelope(await authService.issuePasswordResetToken(String(req.params?.id || ''))));
    } catch (error) {
      next(error);
    }
  }

  revokePasswordResetRequest(req: RequestLike, res: ResponseLike, next: NextFunctionLike) {
    try {
      res.json(successEnvelope(authService.revokePasswordResetToken(String(req.params?.id || ''))));
    } catch (error) {
      next(error);
    }
  }

  getLegacyDataSummary(_req: RequestLike, res: ResponseLike, next: NextFunctionLike) {
    try {
      res.json(successEnvelope(legacyMigrationService.getSummary()));
    } catch (error) {
      next(error);
    }
  }

  dryRunLegacyDataMigration(req: RequestLike, res: ResponseLike, next: NextFunctionLike) {
    try {
      res.json(successEnvelope(legacyMigrationService.dryRun(req.body)));
    } catch (error) {
      next(error);
    }
  }

  migrateLegacyData(req: RequestLike, res: ResponseLike, next: NextFunctionLike) {
    try {
      res.json(successEnvelope(legacyMigrationService.migrate(req.body)));
    } catch (error) {
      next(error);
    }
  }
}

export const adminConfigController = new AdminConfigController();
