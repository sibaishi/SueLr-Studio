import { successEnvelope } from '../../app/http/envelope.ts';
import { getRuntimeMode } from '../../platform/runtime/index.ts';
import type { DynamicValue, NextFunctionLike, RequestLike, ResponseLike } from '../types.ts';
import { adminConfigService } from './admin-config.service.ts';

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
}

export const adminConfigController = new AdminConfigController();
