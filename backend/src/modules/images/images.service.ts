import { ProviderError } from '../../app/errors/index.ts';
import { runImageGeneration } from '../../platform/ai/image-service.ts';
import { createLogger } from '../../platform/logging/logger.ts';
import { settingsService } from '../settings/settings.service.ts';
import type { DynamicValue, PlainObject } from '../types.ts';

const logger = createLogger({ module: 'images-service' });

export class ImagesService {
  settingsService;
  runImageGeneration;

  constructor(dependencies: PlainObject = {}) {
    this.settingsService = dependencies.settingsService || settingsService;
    this.runImageGeneration = dependencies.runImageGeneration || runImageGeneration;
  }

  async generate(body: DynamicValue, options: PlainObject = {}) {
    try {
      const runtimeConfig = this.settingsService.buildRuntimeConfig(body?.apiConfig || {});
      return await this.runImageGeneration(body || {}, {
        ...runtimeConfig,
        abortSignal: options.signal || body?.signal,
        scope: options.scope,
      });
    } catch (error: unknown) {
      const normalizedError = error as DynamicValue;
      logger.error('image generation failed', { code: normalizedError?.code, message: normalizedError?.message });
      throw normalizedError?.status
        ? normalizedError
        : new ProviderError('IMAGE_GENERATION_FAILED', error instanceof Error ? error.message : '图片生成失败');
    }
  }
}

export const imagesService = new ImagesService();
