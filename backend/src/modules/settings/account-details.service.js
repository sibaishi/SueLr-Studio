import { ProviderError, ValidationError } from '../../app/errors/index.js';
import { proxyAwareFetch } from '../../platform/http/proxy-aware-fetch.js';
import { STORAGE_PATHS, readJsonFile, writeJsonFile } from '../../platform/storage/index.js';

const ACCOUNT_DETAILS_BASE_URL = 'https://www.6789api.top';
const LOGIN_PATH = '/api/user/login?turnstile=';
const SELF_PATH = '/api/user/self';
const LOG_SELF_PATH = '/api/log/self';
const DEFAULT_STATE = {
  username: '',
  password: '',
  session: '',
  sessionExpiresAt: 0,
  user: null,
  balance: null,
  updatedAt: 0,
};

function cleanText(value, maxLength = 4000) {
  return String(value || '').trim().slice(0, maxLength);
}

function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function readState() {
  const current = readJsonFile(
    STORAGE_PATHS.accountDetailsFile,
    readJsonFile(STORAGE_PATHS.legacyAccountDetailsFile, DEFAULT_STATE),
  );
  return {
    ...DEFAULT_STATE,
    ...(current && typeof current === 'object' ? current : {}),
  };
}

function writeState(next) {
  writeJsonFile(STORAGE_PATHS.accountDetailsFile, {
    ...DEFAULT_STATE,
    ...next,
    updatedAt: Date.now(),
  });
}

function publicState(state = readState()) {
  return {
    configured: Boolean(state.username && state.password),
    username: state.username || '',
    loggedIn: Boolean(state.session),
    sessionExpiresAt: Number(state.sessionExpiresAt) || 0,
    user: state.user || null,
    balance: state.balance || null,
    updatedAt: Number(state.updatedAt) || 0,
  };
}

function extractSessionCookie(response) {
  const setCookie = response.headers.getSetCookie?.() || [];
  const rawCookie = setCookie.find((item) => /^session=/i.test(item)) || response.headers.get('set-cookie') || '';
  const match = rawCookie.match(/(?:^|;\s*)session=([^;]+)/i);
  if (!match) {
    throw new ProviderError('ACCOUNT_DETAILS_LOGIN_FAILED', 'account login succeeded but did not return a session cookie');
  }

  const expires = rawCookie.match(/expires=([^;]+)/i);
  const sessionExpiresAt = expires ? Date.parse(expires[1]) || 0 : 0;
  return { session: match[1], sessionExpiresAt };
}

function normalizeUser(data) {
  const user = data?.data || {};
  return {
    id: Number(user.id) || 0,
    username: cleanText(user.username, 200),
    displayName: cleanText(user.display_name, 200),
    role: Number(user.role) || 0,
    status: Number(user.status) || 0,
  };
}

function normalizeBalance(data) {
  const payload = data?.data || {};
  const quota = Number(payload.quota);
  if (!Number.isFinite(quota)) {
    throw new ProviderError('ACCOUNT_DETAILS_BALANCE_INVALID', 'account details response did not include quota');
  }

  const usedQuota = Number(payload.used_quota) || 0;
  const requestCount = Number(payload.request_count) || 0;
  return {
    quota,
    usedQuota,
    requestCount,
    balance: round2(quota / 500000),
    usedBalance: round2(usedQuota / 500000),
    refreshedAt: Date.now(),
  };
}

function normalizePositiveInteger(value, fallback, max = 1000) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(max, Math.round(parsed));
}

function normalizeLogItem(item = {}) {
  const quota = Number(item.quota) || 0;
  return {
    id: Number(item.id) || 0,
    userId: Number(item.user_id) || 0,
    createdAt: Number(item.created_at) || 0,
    type: Number(item.type) || 0,
    content: cleanText(item.content, 1000),
    tokenName: cleanText(item.token_name, 200),
    modelName: cleanText(item.model_name, 200),
    quota,
    cost: round2(quota / 500000),
    promptTokens: Number(item.prompt_tokens) || 0,
    completionTokens: Number(item.completion_tokens) || 0,
  };
}

function normalizeLogResponse(data, page, pageSize) {
  const payload = data?.data;
  const items = Array.isArray(payload) ? payload : (Array.isArray(payload?.items) ? payload.items : []);
  return {
    items: items.map(normalizeLogItem),
    total: Number(payload?.total) || items.length,
    page: Number(payload?.page) || page,
    pageSize: Number(payload?.page_size) || Number(payload?.pageSize) || pageSize,
  };
}

function buildLogQuery(query = {}) {
  const page = normalizePositiveInteger(query.page ?? query.p, 1, 100000);
  const pageSize = normalizePositiveInteger(query.pageSize ?? query.page_size, 20, 100);
  const params = new URLSearchParams({
    p: String(page),
    page_size: String(pageSize),
  });
  const optionalParams = {
    type: query.type,
    start_timestamp: query.startTimestamp ?? query.start_timestamp,
    end_timestamp: query.endTimestamp ?? query.end_timestamp,
    token_name: query.tokenName ?? query.token_name,
    model_name: query.modelName ?? query.model_name,
  };
  for (const [key, value] of Object.entries(optionalParams)) {
    const cleaned = cleanText(value, 500);
    if (cleaned) params.set(key, cleaned);
  }
  return { page, pageSize, params };
}

async function parseJsonResponse(response, failureCode, fallbackMessage) {
  let data = null;
  try {
    data = await response.json();
  } catch {
    throw new ProviderError(failureCode, fallbackMessage);
  }

  if (!response.ok || data?.success !== true) {
    throw new ProviderError(failureCode, data?.message || fallbackMessage);
  }
  return data;
}

export class AccountDetailsService {
  getPublicState() {
    return publicState();
  }

  async saveCredentials(payload = {}) {
    const username = cleanText(payload.username, 500);
    const password = cleanText(payload.password, 500);
    if (!username || !password) {
      throw new ValidationError('ACCOUNT_DETAILS_CREDENTIALS_REQUIRED', 'Please enter the account username and password');
    }

    const state = await this.login({ username, password });
    return publicState(await this.fetchAndStoreBalance(state));
  }

  async login({ username, password }) {
    const response = await proxyAwareFetch(`${ACCOUNT_DETAILS_BASE_URL}${LOGIN_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
      signal: AbortSignal.timeout(15000),
    });
    const data = await parseJsonResponse(response, 'ACCOUNT_DETAILS_LOGIN_FAILED', 'account login failed');
    const cookie = extractSessionCookie(response);
    const state = {
      username,
      password,
      ...cookie,
      user: normalizeUser(data),
      balance: null,
    };
    writeState(state);
    return readState();
  }

  async refreshBalance(options = {}) {
    const current = options.state || readState();
    if (!current.username || !current.password) {
      throw new ValidationError('ACCOUNT_DETAILS_NOT_CONFIGURED', 'Please configure the account username and password first');
    }

    let state = await this.ensureSession(current);

    try {
      return publicState(await this.fetchAndStoreBalance(state));
    } catch (error) {
      if (options.retried || !['ACCOUNT_DETAILS_BALANCE_FAILED', 'ACCOUNT_DETAILS_BALANCE_INVALID'].includes(error?.code)) {
        throw error;
      }
      const relogged = await this.login({ username: current.username, password: current.password });
      return this.refreshBalance({ retried: true, state: relogged });
    }
  }

  async ensureSession(state = readState()) {
    if (!state.username || !state.password) {
      throw new ValidationError('ACCOUNT_DETAILS_NOT_CONFIGURED', 'Please configure the account username and password first');
    }
    if (!state.session || (state.sessionExpiresAt && state.sessionExpiresAt <= Date.now())) {
      return this.login({ username: state.username, password: state.password });
    }
    return state;
  }

  async fetchAndStoreBalance(state) {
    const response = await proxyAwareFetch(`${ACCOUNT_DETAILS_BASE_URL}${SELF_PATH}`, {
      method: 'GET',
      headers: {
        Accept: 'application/json, text/plain, */*',
        'cache-control': 'no-store',
        Cookie: `session=${state.session}`,
        ...(state.user?.id ? { 'new-api-user': String(state.user.id) } : {}),
      },
      signal: AbortSignal.timeout(15000),
    });
    const data = await parseJsonResponse(response, 'ACCOUNT_DETAILS_BALANCE_FAILED', 'account details query failed');
    const next = {
      ...state,
      user: normalizeUser(data),
      balance: normalizeBalance(data),
    };
    writeState(next);
    return readState();
  }

  async getLogs(query = {}, options = {}) {
    const current = options.state || readState();
    const { page, pageSize, params } = buildLogQuery(query);
    const state = await this.ensureSession(current);

    try {
      const response = await proxyAwareFetch(`${ACCOUNT_DETAILS_BASE_URL}${LOG_SELF_PATH}?${params.toString()}`, {
        method: 'GET',
        headers: {
          Accept: 'application/json, text/plain, */*',
          'cache-control': 'no-store',
          Cookie: `session=${state.session}`,
          ...(state.user?.id ? { 'new-api-user': String(state.user.id) } : {}),
        },
        signal: AbortSignal.timeout(15000),
      });
      const data = await parseJsonResponse(response, 'ACCOUNT_DETAILS_LOGS_FAILED', 'account logs query failed');
      return normalizeLogResponse(data, page, pageSize);
    } catch (error) {
      if (options.retried || error?.code !== 'ACCOUNT_DETAILS_LOGS_FAILED') {
        throw error;
      }
      const relogged = await this.login({ username: current.username, password: current.password });
      return this.getLogs(query, { retried: true, state: relogged });
    }
  }

  clear() {
    writeState(DEFAULT_STATE);
    return publicState(readState());
  }
}

export const accountDetailsService = new AccountDetailsService();
