import { createLogger } from '../../platform/logging/logger.js';
import { fromLegacyError } from '../../app/errors/index.js';
import { settingsRepository } from './settings.repository.js';

const logger = createLogger({ module: 'settings-service' });

export class SettingsService {
  constructor(repository = settingsRepository) {
    this.repository = repository;
  }

  getSettingsResponse() {
    try {
      return this.repository.buildSettingsResponse(this.repository.readSettings());
    } catch (error) {
      throw fromLegacyError(error);
    }
  }

  getStudioSettings() {
    try {
      return this.repository.readSettings();
    } catch (error) {
      throw fromLegacyError(error);
    }
  }

  updateRuntimeConfig(patch) {
    try {
      const updated = this.repository.updateActiveRuntimeConfig(patch);
      logger.info('runtime settings updated');
      return this.repository.buildSettingsResponse(updated);
    } catch (error) {
      throw fromLegacyError(error);
    }
  }

  updateStudioSettings(patch) {
    try {
      const updated = this.repository.updateSettings(patch);
      logger.info('studio settings updated');
      return updated;
    } catch (error) {
      throw fromLegacyError(error);
    }
  }

  resetSettings() {
    try {
      const nextSettings = this.repository.resetSettings();
      logger.info('settings reset');
      return this.repository.buildSettingsResponse(nextSettings);
    } catch (error) {
      throw fromLegacyError(error);
    }
  }

  buildRuntimeConfig(overrides = {}) {
    try {
      return this.repository.buildRuntimeApiConfig(overrides);
    } catch (error) {
      throw fromLegacyError(error);
    }
  }

  async discoverModels(payload = {}) {
    try {
      const runtimeConfig = this.repository.buildRuntimeApiConfig(payload);
      const models = await this.repository.fetchModelsFromProvider(runtimeConfig);
      return {
        runtimeConfig,
        models,
      };
    } catch (error) {
      throw fromLegacyError(error, { status: 502, code: 'PROVIDER_REQUEST_FAILED', message: '模型发现失败' });
    }
  }
}

export const settingsService = new SettingsService();
