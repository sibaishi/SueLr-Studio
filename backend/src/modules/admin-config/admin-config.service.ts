import { ValidationError, fromLegacyError } from '../../app/errors/index.js';
import { runWebSearch } from '../../platform/ai/search-service.js';
import type { DynamicValue } from '../types.js';
import { adminConfigRepository } from './admin-config.repository.js';

export class AdminConfigService {
  repository;

  constructor(repository = adminConfigRepository) {
    this.repository = repository;
  }

  getAdminConfig() {
    try {
      return this.repository.buildPublicAdminConfig(this.repository.readAdminConfig());
    } catch (error) {
      throw fromLegacyError(error);
    }
  }

  updateAdminConfig(patch: DynamicValue) {
    try {
      return this.repository.buildPublicAdminConfig(this.repository.updateAdminConfig(patch));
    } catch (error) {
      throw fromLegacyError(error);
    }
  }

  getResolvedSearchConfig() {
    try {
      return this.repository.buildSearchConfig(this.repository.readAdminConfig());
    } catch (error) {
      throw fromLegacyError(error);
    }
  }

  getResolvedNetworkConfig() {
    try {
      return this.repository.buildNetworkConfig(this.repository.readAdminConfig());
    } catch (error) {
      throw fromLegacyError(error);
    }
  }

  async testSearch(payload: DynamicValue = {}) {
    const search = this.getResolvedSearchConfig();
    if (!search.enabled) {
      throw new ValidationError('SEARCH_DISABLED', '当前部署未启用联网搜索');
    }

    if (search.provider !== 'tavily') {
      throw new ValidationError('SEARCH_PROVIDER_UNSUPPORTED', `Unsupported search provider: ${search.provider}`);
    }

    return await runWebSearch({
      tavilyApiKey: payload.tavilyApiKey || search.tavilyApiKey,
      query: payload.query || 'AI 最新资讯',
      maxResults: payload.maxResults || 3,
      includeAnswer: true,
      signal: undefined,
    });
  }
}

export const adminConfigService = new AdminConfigService();
