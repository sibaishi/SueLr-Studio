import { successEnvelope } from '../../app/http/envelope.js';
import { settingsService } from './settings.service.js';

export class SettingsController {
  getSettings(_req, res, next) {
    try {
      res.json(successEnvelope(settingsService.getSettingsResponse()));
    } catch (error) {
      next(error);
    }
  }

  updateSettings(req, res, next) {
    try {
      res.json(successEnvelope(settingsService.updateRuntimeConfig(req.body)));
    } catch (error) {
      next(error);
    }
  }

  resetSettings(_req, res, next) {
    try {
      res.json({
        ...successEnvelope(settingsService.resetSettings()),
        message: '已恢复默认设置。工作流本身未被修改。',
      });
    } catch (error) {
      next(error);
    }
  }

  async testApi(req, res, next) {
    try {
      const { models } = await settingsService.discoverModels(req.body);
      res.json(successEnvelope({
        message: `连接成功，已加载 ${models.all.length} 个模型`,
        models: models.all,
        categorized: {
          chat: models.chat,
          image: models.image,
          video: models.video,
        },
      }));
    } catch (error) {
      next(error);
    }
  }

  getModels(_req, res, next) {
    try {
      res.json(successEnvelope(settingsService.getSettingsResponse().availableProjectModels));
    } catch (error) {
      next(error);
    }
  }

  async discoverModels(req, res, next) {
    try {
      const { models } = await settingsService.discoverModels(req.body);
      res.json(successEnvelope(models));
    } catch (error) {
      next(error);
    }
  }

  getStudioSettings(_req, res, next) {
    try {
      res.json(successEnvelope(settingsService.getStudioSettings()));
    } catch (error) {
      next(error);
    }
  }

  getStorageSettings(_req, res, next) {
    try {
      res.json(successEnvelope(settingsService.getStorageSettings()));
    } catch (error) {
      next(error);
    }
  }

  updateStorageSettings(req, res, next) {
    try {
      res.json(successEnvelope(settingsService.updateStorageSettings(req.body)));
    } catch (error) {
      next(error);
    }
  }

  resetStorageSettings(_req, res, next) {
    try {
      res.json(successEnvelope(settingsService.resetStorageSettings()));
    } catch (error) {
      next(error);
    }
  }

  async selectDirectory(_req, res, next) {
    try {
      res.json(successEnvelope(await settingsService.selectDirectory()));
    } catch (error) {
      next(error);
    }
  }

  async restartBackend(_req, res, next) {
    try {
      res.json(successEnvelope(await settingsService.requestBackendRestart()));
    } catch (error) {
      next(error);
    }
  }

  updateStudioSettings(req, res, next) {
    try {
      res.json(successEnvelope(settingsService.updateStudioSettings(req.body)));
    } catch (error) {
      next(error);
    }
  }
}

export const settingsController = new SettingsController();
