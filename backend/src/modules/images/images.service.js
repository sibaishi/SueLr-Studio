import { createLogger } from '../../platform/logging/logger.js';
import { ProviderError } from '../../app/errors/index.js';
import { settingsService } from '../settings/settings.service.js';
import { runImageGeneration } from '../../platform/ai/image-service.js';

const logger = createLogger({ module: 'images-service' });

export class ImagesService {
  constructor(dependencies = {}) {
    this.settingsService = dependencies.settingsService || settingsService;
    this.runImageGeneration = dependencies.runImageGeneration || runImageGeneration;
  }

  async generate(body, options = {}) {
    try {
      const runtimeConfig = this.settingsService.buildRuntimeConfig(body?.apiConfig || {});
      return await this.runImageGeneration(body || {}, {
        ...runtimeConfig,
        abortSignal: options.signal || body?.signal,
        scope: options.scope,
      });
    } catch (error) {
      logger.error('image generation failed', { code: error?.code, message: error?.message });
      throw error?.status ? error : new ProviderError('IMAGE_GENERATION_FAILED', error instanceof Error ? error.message : '图片生成失败');
    }
  }
}

export const imagesService = new ImagesService();
