import { createLogger } from '../../platform/logging/logger.js';
import { ProviderError, ValidationError } from '../../app/errors/index.js';
import { settingsService } from '../settings/settings.service.js';
import { imagesService } from '../images/images.service.js';
import { runChatCompletion } from '../../platform/ai/chat-service.js';
import { formatWebSearchResult, normalizeWebSearchResult, runWebSearch } from '../../platform/ai/search-service.js';
import { executeVideoGeneration, pollVideoTask, submitVideoGeneration } from '../../platform/ai/video-service.js';

const logger = createLogger({ module: 'capabilities-service' });

export class CapabilitiesService {
  constructor(dependencies = {}) {
    this.settingsService = dependencies.settingsService || settingsService;
    this.imagesService = dependencies.imagesService || imagesService;
  }

  buildRuntimeConfig(apiConfig = {}) {
    return this.settingsService.buildRuntimeConfig(apiConfig || {});
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
        signal: body.signal,
      });
      return response.json();
    } catch (error) {
      logger.error('chat capability failed', { code: error?.code, message: error?.message });
      throw error?.status ? error : new ProviderError('CHAT_FAILED', error instanceof Error ? error.message : 'Chat failed');
    }
  }

  async chatStream(body) {
    try {
      const runtimeConfig = this.buildRuntimeConfig(body.apiConfig || {});
      return await runChatCompletion({
        apiKey: runtimeConfig.apiKey,
        baseUrl: runtimeConfig.baseUrl,
        providerConfig: runtimeConfig.providerConfig,
        projectModels: runtimeConfig.projectModels,
        model: body.model,
        messages: body.messages || [],
        tools: body.tools,
        stream: true,
        signal: body.signal,
      });
    } catch (error) {
      logger.error('chat stream capability failed', { code: error?.code, message: error?.message });
      throw error?.status ? error : new ProviderError('CHAT_STREAM_FAILED', error instanceof Error ? error.message : 'Chat stream failed');
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
      const structured = normalizeWebSearchResult(data, { query: body.query });
      return { raw: data, content: formatWebSearchResult(structured), structured };
    } catch (error) {
      throw error?.status ? error : new ProviderError('SEARCH_FAILED', error instanceof Error ? error.message : 'Search failed');
    }
  }

  async image(body) {
    return this.imagesService.generate(body);
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

  async video(body) {
    try {
      const runtimeConfig = this.buildRuntimeConfig(body.apiConfig || {});
      return await executeVideoGeneration({
        model: body.model,
        prompt: body.prompt,
        duration: body.duration,
        aspect_ratio: body.aspect_ratio,
        resolution: body.resolution,
        reference: body.image_urls?.length ? body.image_urls : body.image_url,
        video: body.video_urls?.length ? body.video_urls : body.video_url,
        audio: body.input_audios?.length ? body.input_audios : body.input_audio,
      }, {
        ...runtimeConfig,
        abortSignal: body.signal,
      });
    } catch (error) {
      throw error?.status ? error : new ProviderError('VIDEO_GENERATE_FAILED', error instanceof Error ? error.message : 'Video generation failed');
    }
  }

  async getVideoStatus(taskId) {
    if (!taskId) throw new ValidationError('VALIDATION_ERROR', 'taskId 不能为空');
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
