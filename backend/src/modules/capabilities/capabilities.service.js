import { createLogger } from '../../platform/logging/logger.js';
import { ProviderError, ValidationError } from '../../app/errors/index.js';
import { settingsService } from '../settings/settings.service.js';
import { runChatCompletion } from '../../../services/chatService.js';
import { runImageGeneration } from '../../../services/imageService.js';
import { formatWebSearchResult, runWebSearch } from '../../../services/searchService.js';
import { pollVideoTask, submitVideoGeneration } from '../../../services/videoService.js';

const logger = createLogger({ module: 'capabilities-service' });

export class CapabilitiesService {
  buildRuntimeConfig(apiConfig = {}) {
    return settingsService.buildRuntimeConfig(apiConfig || {});
  }

  async chat(body) {
    try {
      const runtimeConfig = this.buildRuntimeConfig(body.apiConfig || {});
      const response = await runChatCompletion({
        apiKey: runtimeConfig.apiKey,
        baseUrl: runtimeConfig.baseUrl,
        providerConfig: runtimeConfig.providerConfig,
        projectModels: runtimeConfig.projectModels,
        model: body.model,
        messages: body.messages || [],
        tools: body.tools,
        stream: false,
        signal: undefined,
      });
      return response.json();
    } catch (error) {
      logger.error('chat capability failed', { code: error?.code, message: error?.message });
      throw error?.status ? error : new ProviderError('CHAT_FAILED', error instanceof Error ? error.message : 'Chat failed');
    }
  }

  async search(body) {
    try {
      const runtimeConfig = this.buildRuntimeConfig(body.apiConfig || {});
      const data = await runWebSearch({
        tavilyApiKey: runtimeConfig.tavilyApiKey,
        query: body.query,
        maxResults: body.maxResults,
        includeAnswer: body.includeAnswer !== false,
        signal: undefined,
      });
      return { raw: data, content: formatWebSearchResult(data) };
    } catch (error) {
      throw error?.status ? error : new ProviderError('SEARCH_FAILED', error instanceof Error ? error.message : 'Search failed');
    }
  }

  async image(body) {
    try {
      const runtimeConfig = this.buildRuntimeConfig(body.apiConfig || {});
      return await runImageGeneration(body, { ...runtimeConfig, abortSignal: undefined });
    } catch (error) {
      throw error?.status ? error : new ProviderError('IMAGE_FAILED', error instanceof Error ? error.message : 'Image generation failed');
    }
  }

  async submitVideo(body) {
    try {
      const runtimeConfig = this.buildRuntimeConfig(body.apiConfig || {});
      return await submitVideoGeneration({
        apiKey: runtimeConfig.apiKey,
        baseUrl: runtimeConfig.baseUrl,
        providerConfig: runtimeConfig.providerConfig,
        projectModels: runtimeConfig.projectModels,
        model: body.model,
        prompt: body.prompt,
        duration: body.duration,
        aspect_ratio: body.aspect_ratio,
        resolution: body.resolution,
        image_url: body.image_url,
        image_urls: body.image_urls,
        video_url: body.video_url,
        video_urls: body.video_urls,
        input_audio: body.input_audio,
        input_audios: body.input_audios,
        messages: body.messages,
        signal: undefined,
      });
    } catch (error) {
      throw error?.status ? error : new ProviderError('VIDEO_SUBMIT_FAILED', error instanceof Error ? error.message : 'Video submit failed');
    }
  }

  async getVideoStatus(taskId) {
    if (!taskId) throw new ValidationError('VALIDATION_ERROR', 'taskId cannot be empty');
    try {
      const runtimeConfig = this.buildRuntimeConfig();
      return await pollVideoTask({
        baseUrl: runtimeConfig.baseUrl,
        apiKey: runtimeConfig.apiKey,
        providerConfig: runtimeConfig.providerConfig,
        taskId,
        signal: undefined,
      });
    } catch (error) {
      throw error?.status ? error : new ProviderError('VIDEO_STATUS_FAILED', error instanceof Error ? error.message : 'Video status failed');
    }
  }
}

export const capabilitiesService = new CapabilitiesService();
