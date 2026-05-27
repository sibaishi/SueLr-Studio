import { AppError, ConflictError, fromLegacyError } from '../../app/errors/index.js';
import { createLogger } from '../../platform/logging/logger.js';
import { getRuntimeCapabilities } from '../../platform/runtime/index.js';
import { scheduleBackendRestart } from '../../platform/system/restart-backend.js';
import { selectDirectory as selectSystemDirectory } from '../../platform/system/select-directory.js';
import { executionService } from '../execution/execution.service.js';
import type { DynamicValue, PlainObject } from '../types.js';
import { settingsRepository } from './settings.repository.js';

const logger = createLogger({ module: 'settings-service' });
const REDACTED_STORAGE_LABEL = '[server-managed]';

type SettingsServiceOptions = {
  executionService?: DynamicValue;
  restartBackend?: () => Promise<DynamicValue>;
  getRuntimeCapabilities?: () => DynamicValue;
};

function sanitizeStorageSettingsForRuntime(settings: DynamicValue, runtime: DynamicValue) {
  if (!settings) return settings;

  if (!runtime?.mode?.startsWith?.('server')) {
    return {
      ...settings,
      pathsRedacted: false,
      canManagePath: true,
    };
  }

  return {
    ...settings,
    effectiveRoot: REDACTED_STORAGE_LABEL,
    defaultRoot: REDACTED_STORAGE_LABEL,
    customRoot: '',
    envOverride: settings.envOverride ? REDACTED_STORAGE_LABEL : '',
    legacyRoot: settings.legacyRoot ? REDACTED_STORAGE_LABEL : '',
    pathsRedacted: true,
    canManagePath: false,
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

  getSettingsResponse() {
    try {
      return this.repository.buildSettingsResponse(this.repository.readSettings());
    } catch (error) {
      throw fromLegacyError(error);
    }
  }

  getStudioSettings() {
    try {
      return this.repository.buildStudioSettingsResponse(this.repository.readSettings());
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

  updateRuntimeConfig(patch: PlainObject) {
    try {
      const updated = this.repository.updateActiveRuntimeConfig(patch);
      logger.info('runtime settings updated');
      return this.repository.buildSettingsResponse(updated);
    } catch (error) {
      throw fromLegacyError(error);
    }
  }

  updateStudioSettings(patch: PlainObject) {
    try {
      const updated = this.repository.updateSettings(patch);
      logger.info('studio settings updated');
      return this.repository.buildStudioSettingsResponse(updated);
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

  buildRuntimeConfig(overrides: PlainObject = {}) {
    try {
      return this.repository.buildRuntimeApiConfig(overrides);
    } catch (error) {
      throw fromLegacyError(error);
    }
  }

  async discoverModels(payload: PlainObject = {}) {
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
