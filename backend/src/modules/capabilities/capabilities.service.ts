import { ProviderError, ValidationError } from '../../app/errors/index.ts';
import { runChatCompletion } from '../../platform/ai/chat-service.ts';
import { formatWebSearchResult, normalizeWebSearchResult, runWebSearch } from '../../platform/ai/search-service.ts';
import { executeVideoGeneration, pollVideoTask, submitVideoGeneration } from '../../platform/ai/video-service.ts';
import { createLogger } from '../../platform/logging/logger.ts';
import { getRuntimeCapabilities } from '../../platform/runtime/index.ts';
import { imagesService } from '../images/images.service.ts';
import { settingsService } from '../settings/settings.service.ts';
import type { DynamicValue, PlainObject } from '../types.ts';

const logger = createLogger({ module: 'capabilities-service' });

type CapabilitiesServiceDependencies = {
  settingsService?: DynamicValue;
  imagesService?: DynamicValue;
};

export class CapabilitiesService {
  settingsService;
  imagesService;

  constructor(dependencies: CapabilitiesServiceDependencies = {}) {
    this.settingsService = dependencies.settingsService || settingsService;
    this.imagesService = dependencies.imagesService || imagesService;
  }

  buildRuntimeConfig(apiConfig: PlainObject = {}, scope?: DynamicValue) {
    return this.settingsService.buildRuntimeConfig(apiConfig || {}, scope);
  }

  getRuntimeCapabilities(_options: PlainObject = {}) {
    return getRuntimeCapabilities(undefined, { user: _options.user || null });
  }

  async chat(body: DynamicValue, _options: PlainObject = {}) {
    try {
      const runtimeConfig = this.buildRuntimeConfig(body.apiConfig || {}, _options.scope);
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
    } catch (error: unknown) {
      const normalizedError = error as DynamicValue;
      logger.error('chat capability failed', { code: normalizedError?.code, message: normalizedError?.message });
      throw normalizedError?.status
        ? normalizedError
        : new ProviderError('CHAT_FAILED', error instanceof Error ? error.message : 'Chat failed');
    }
  }

  async chatStream(body: DynamicValue, _options: PlainObject = {}) {
    try {
      const runtimeConfig = this.buildRuntimeConfig(body.apiConfig || {}, _options.scope);
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
    } catch (error: unknown) {
      const normalizedError = error as DynamicValue;
      logger.error('chat stream capability failed', { code: normalizedError?.code, message: normalizedError?.message });
      throw normalizedError?.status
        ? normalizedError
        : new ProviderError('CHAT_STREAM_FAILED', error instanceof Error ? error.message : 'Chat stream failed');
    }
  }

  async search(body: DynamicValue, _options: PlainObject = {}) {
    try {
      const runtimeConfig = this.buildRuntimeConfig(body.apiConfig || {}, _options.scope);
      if (!runtimeConfig.webSearchEnabled) {
        throw new ValidationError('SEARCH_DISABLED', '当前部署未启用联网搜索');
      }
      const data = await runWebSearch({
        tavilyApiKey: runtimeConfig.tavilyApiKey,
        query: body.query,
        maxResults: body.maxResults,
        includeAnswer: body.includeAnswer !== false,
        signal: undefined,
      });
      const structured = normalizeWebSearchResult(data as PlainObject, { query: body.query });
      return { raw: data, content: formatWebSearchResult(structured), structured };
    } catch (error: unknown) {
      const normalizedError = error as DynamicValue;
      throw normalizedError?.status
        ? normalizedError
        : new ProviderError('SEARCH_FAILED', error instanceof Error ? error.message : 'Search failed');
    }
  }

  async image(body: DynamicValue, options: PlainObject = {}) {
    return this.imagesService.generate(body, options);
  }

  async submitVideo(body: DynamicValue, _options: PlainObject = {}) {
    try {
      const runtimeConfig = this.buildRuntimeConfig(body.apiConfig || {}, _options.scope);
      return await submitVideoGeneration({
        apiKey: runtimeConfig.apiKey,
        baseUrl: runtimeConfig.baseUrl,
        providerConfig: runtimeConfig.providerConfig,
        projectModels: runtimeConfig.projectModels,
        scope: _options.scope,
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
    } catch (error: unknown) {
      const normalizedError = error as DynamicValue;
      throw normalizedError?.status
        ? normalizedError
        : new ProviderError('VIDEO_SUBMIT_FAILED', error instanceof Error ? error.message : 'Video submit failed');
    }
  }

  async video(body: DynamicValue, _options: PlainObject = {}) {
    try {
      const runtimeConfig = this.buildRuntimeConfig(body.apiConfig || {}, _options.scope);
      return await executeVideoGeneration(
        {
          model: body.model,
          prompt: body.prompt,
          duration: body.duration,
          aspect_ratio: body.aspect_ratio,
          resolution: body.resolution,
          reference: body.image_urls?.length ? body.image_urls : body.image_url,
          video: body.video_urls?.length ? body.video_urls : body.video_url,
          audio: body.input_audios?.length ? body.input_audios : body.input_audio,
        },
        {
          ...runtimeConfig,
          scope: _options.scope,
          abortSignal: body.signal,
        },
      );
    } catch (error: unknown) {
      const normalizedError = error as DynamicValue;
      throw normalizedError?.status
        ? normalizedError
        : new ProviderError(
            'VIDEO_GENERATE_FAILED',
            error instanceof Error ? error.message : 'Video generation failed',
          );
    }
  }

  async getVideoStatus(taskId: string, apiConfig: PlainObject = {}, _options: PlainObject = {}) {
    if (!taskId) throw new ValidationError('VALIDATION_ERROR', 'taskId 不能为空');
    try {
      const runtimeConfig = this.buildRuntimeConfig(apiConfig || {}, _options.scope);
      return await pollVideoTask({
        baseUrl: runtimeConfig.baseUrl,
        apiKey: runtimeConfig.apiKey,
        providerConfig: runtimeConfig.providerConfig,
        taskId,
        signal: undefined,
      });
    } catch (error: unknown) {
      const normalizedError = error as DynamicValue;
      throw normalizedError?.status
        ? normalizedError
        : new ProviderError('VIDEO_STATUS_FAILED', error instanceof Error ? error.message : 'Video status failed');
    }
  }
}

export const capabilitiesService = new CapabilitiesService();
