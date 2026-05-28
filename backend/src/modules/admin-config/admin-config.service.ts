import { ValidationError, fromLegacyError } from '../../app/errors/index.ts';
import { runWebSearch } from '../../platform/ai/search-service.ts';
import { emailService } from '../../platform/notifications/email.service.ts';
import type { DynamicValue } from '../types.ts';
import { adminConfigRepository } from './admin-config.repository.ts';

emailService.setConfigProvider(() => adminConfigRepository.buildEmailConfig(adminConfigRepository.readAdminConfig()));

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

  getResolvedEmailConfig() {
    try {
      return this.repository.buildEmailConfig(this.repository.readAdminConfig());
    } catch (error) {
      throw fromLegacyError(error);
    }
  }

  getEmailStatus() {
    try {
      return emailService.getStatus();
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

  async testEmail(payload: DynamicValue = {}) {
    try {
      return await emailService.test(String(payload.to || ''));
    } catch (error) {
      throw fromLegacyError(error);
    }
  }
}

export const adminConfigService = new AdminConfigService();
