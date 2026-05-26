import { successEnvelope } from '../../app/http/envelope.js';
import { adminConfigService } from './admin-config.service.js';

export class AdminConfigController {
  getSettings(_req, res, next) {
    try {
      res.json(successEnvelope(adminConfigService.getAdminConfig()));
    } catch (error) {
      next(error);
    }
  }

  updateSettings(req, res, next) {
    try {
      res.json(successEnvelope(adminConfigService.updateAdminConfig(req.body)));
    } catch (error) {
      next(error);
    }
  }

  async testSearch(req, res, next) {
    try {
      const data = await adminConfigService.testSearch(req.body);
      res.json(
        successEnvelope({
          message: `搜索连接成功，已返回 ${Array.isArray(data?.results) ? data.results.length : 0} 条结果`,
          data,
        }),
      );
    } catch (error) {
      next(error);
    }
  }

  validateAccess(req, res, next) {
    try {
      const headerKey = String(req.headers['x-admin-access-key'] || '').trim();
      const bodyKey = String(req.body?.accessKey || '').trim();
      const provided = headerKey || bodyKey;
      const required = String(process.env.APP_ADMIN_ACCESS_KEY || '').trim();
      const requiresAccessKey = String(process.env.APP_RUNTIME_MODE || '')
        .trim()
        .startsWith('server');
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
