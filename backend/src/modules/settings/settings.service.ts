import { AppError, ConflictError, fromLegacyError } from '../../app/errors/index.ts';
import { createLogger } from '../../platform/logging/logger.ts';
import { getRuntimeCapabilities } from '../../platform/runtime/index.ts';
import { scheduleBackendRestart } from '../../platform/system/restart-backend.ts';
import { selectDirectory as selectSystemDirectory } from '../../platform/system/select-directory.ts';
import { executionService } from '../execution/execution.service.ts';
import type { DynamicValue, PlainObject } from '../types.ts';
import { settingsRepository } from './settings.repository.ts';

const logger = createLogger({ module: 'settings-service' });

type SettingsServiceOptions = {
  executionService?: DynamicValue;
  restartBackend?: () => Promise<DynamicValue>;
  getRuntimeCapabilities?: () => DynamicValue;
};

function sanitizeStorageSettingsForRuntime(settings: DynamicValue, runtime: DynamicValue) {
  void runtime;
  if (!settings) return settings;
  return {
    ...settings,
    pathsRedacted: false,
    canManagePath: true,
  };
}

export class SettingsService {
  repository;
  executionService;
  restartBackend;
  getRuntimeCapabilities;

  constructor(repository = settingsRepository, options: SettingsServiceOptions = {}) {
    this.repository = repository;
    this.executionService = options.executionService;
    this.restartBackend = options.restartBackend || scheduleBackendRestart;
    this.getRuntimeCapabilities = options.getRuntimeCapabilities || getRuntimeCapabilities;
  }

  getExecutionService() {
    return this.executionService || executionService;
  }

  getRuntimeCapabilitiesSnapshot() {
    return this.getRuntimeCapabilities();
  }

  assertCapability(key: string, code: string, message: string) {
    if (this.getRuntimeCapabilitiesSnapshot()?.[key]) {
      return;
    }
    throw new AppError(403, code, message);
  }

  getSettingsResponse(scope?: DynamicValue) {
    try {
      return this.repository.buildSettingsResponse(this.repository.readSettings(scope));
    } catch (error) {
      throw fromLegacyError(error);
    }
  }

  getStudioSettings(scope?: DynamicValue) {
    try {
      return this.repository.buildStudioSettingsResponse(this.repository.readSettings(scope));
    } catch (error) {
      throw fromLegacyError(error);
    }
  }

  getStorageSettings() {
    try {
      return sanitizeStorageSettingsForRuntime(
        this.repository.readStorageSettings(),
        this.getRuntimeCapabilitiesSnapshot(),
      );
    } catch (error) {
      throw fromLegacyError(error);
    }
  }

  updateStorageSettings(patch: PlainObject) {
    this.assertCapability(
      'canSelectDirectory',
      'STORAGE_PATH_MANAGEMENT_UNAVAILABLE',
      '当前运行模式不支持修改存储路径',
    );
    try {
      const updated = this.repository.updateStorageSettings(patch);
      logger.info('storage settings updated', { source: updated.source });
      return sanitizeStorageSettingsForRuntime(updated, this.getRuntimeCapabilitiesSnapshot());
    } catch (error) {
      throw fromLegacyError(error);
    }
  }

  resetStorageSettings() {
    this.assertCapability(
      'canSelectDirectory',
      'STORAGE_PATH_MANAGEMENT_UNAVAILABLE',
      '当前运行模式不支持修改存储路径',
    );
    try {
      const updated = this.repository.resetStorageSettings();
      logger.info('storage settings reset', { source: updated.source });
      return sanitizeStorageSettingsForRuntime(updated, this.getRuntimeCapabilitiesSnapshot());
    } catch (error) {
      throw fromLegacyError(error);
    }
  }

  async selectDirectory() {
    this.assertCapability('canSelectDirectory', 'DIRECTORY_PICKER_UNAVAILABLE', '当前运行模式不支持目录选择');

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
    this.assertCapability('canRestartBackend', 'BACKEND_RESTART_UNAVAILABLE', '当前运行模式不支持重启后端');

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

  updateRuntimeConfig(patch: PlainObject, scope?: DynamicValue) {
    try {
      const updated = this.repository.updateActiveRuntimeConfig(patch, scope);
      logger.info('runtime settings updated');
      return this.repository.buildSettingsResponse(updated);
    } catch (error) {
      throw fromLegacyError(error);
    }
  }

  updateStudioSettings(patch: PlainObject, scope?: DynamicValue) {
    try {
      const updated = this.repository.updateSettings(patch, scope);
      logger.info('studio settings updated');
      return this.repository.buildStudioSettingsResponse(updated);
    } catch (error) {
      throw fromLegacyError(error);
    }
  }

  resetSettings(scope?: DynamicValue) {
    try {
      const nextSettings = this.repository.resetSettings(scope);
      logger.info('settings reset');
      return this.repository.buildSettingsResponse(nextSettings);
    } catch (error) {
      throw fromLegacyError(error);
    }
  }

  buildRuntimeConfig(overrides: PlainObject = {}, scope?: DynamicValue) {
    try {
      return this.repository.buildRuntimeApiConfig(overrides, scope);
    } catch (error) {
      throw fromLegacyError(error);
    }
  }

  async discoverModels(payload: PlainObject = {}) {
    try {
      const runtimeConfig = this.repository.buildRuntimeApiConfig(payload, payload.scope);
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
