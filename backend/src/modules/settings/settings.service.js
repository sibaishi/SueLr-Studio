import { createLogger } from '../../platform/logging/logger.js';
import { ConflictError, fromLegacyError } from '../../app/errors/index.js';
import { settingsRepository } from './settings.repository.js';
import { selectDirectory as selectSystemDirectory } from '../../platform/system/select-directory.js';
import { scheduleBackendRestart } from '../../platform/system/restart-backend.js';
import { executionService } from '../execution/execution.service.js';

const logger = createLogger({ module: 'settings-service' });

export class SettingsService {
  constructor(repository = settingsRepository, options = {}) {
    this.repository = repository;
    this.executionService = options.executionService;
    this.restartBackend = options.restartBackend || scheduleBackendRestart;
  }

  getExecutionService() {
    return this.executionService || executionService;
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

  getStorageSettings() {
    try {
      return this.repository.readStorageSettings();
    } catch (error) {
      throw fromLegacyError(error);
    }
  }

  updateStorageSettings(patch) {
    try {
      const updated = this.repository.updateStorageSettings(patch);
      logger.info('storage settings updated', { source: updated.source, effectiveRoot: updated.effectiveRoot });
      return updated;
    } catch (error) {
      throw fromLegacyError(error);
    }
  }

  resetStorageSettings() {
    try {
      const updated = this.repository.resetStorageSettings();
      logger.info('storage settings reset', { source: updated.source, effectiveRoot: updated.effectiveRoot });
      return updated;
    } catch (error) {
      throw fromLegacyError(error);
    }
  }

  async selectDirectory() {
    try {
      const selectedPath = await selectSystemDirectory();
      return { path: selectedPath || null };
    } catch (error) {
      throw fromLegacyError(error, {
        code: 'DIRECTORY_PICKER_FAILED',
        message: '打开目录选择器失败',
      });
    }
  }

  async requestBackendRestart() {
    if (this.getExecutionService()?.runningExecutions?.size > 0) {
      throw new ConflictError('PROJECT_BUSY', '项目正在运行中，请稍后再试');
    }

    try {
      const result = await this.restartBackend();
      logger.warn('backend restart requested', { mode: result?.mode || 'unknown' });
      return result;
    } catch (error) {
      throw fromLegacyError(error, {
        code: 'BACKEND_RESTART_FAILED',
        message: '后端重启失败，请稍后重试',
      });
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
