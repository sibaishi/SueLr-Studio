import { execFileSync } from 'node:child_process';
import type { Dispatcher } from 'undici';
import { EnvHttpProxyAgent, ProxyAgent } from 'undici';

import { createLogger } from '../logging/logger.js';

type ProxyMode = 'system' | 'direct' | 'custom';
type ProxyStrategyMode = 'direct' | 'app-custom' | 'env' | 'windows-registry' | 'windows-pac-unsupported';
type ProxySource =
  | 'app-direct'
  | 'app-no-proxy'
  | 'app-settings'
  | 'app-custom-empty'
  | 'environment'
  | 'windows-registry'
  | 'windows-autoconfig'
  | 'direct';

interface AppProxyConfig {
  mode: ProxyMode;
  httpProxy: string;
  httpsProxy: string;
  noProxy: string;
}

interface WindowsInternetSettings {
  enabled: boolean;
  proxyServer: string;
  proxyOverride: string;
  autoConfigUrl: string;
}

interface ProxyStrategy {
  mode: ProxyStrategyMode;
  proxyUrl: string;
  proxySource: ProxySource;
}

type EnvLike = Record<string, string | undefined>;
type RegistryQueryFn = () => string;

const WINDOWS_INTERNET_SETTINGS_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings';
const logger = createLogger({ module: 'proxy-aware-fetch' });
const logInfo = logger.info as (message: string, fields?: Record<string, unknown>) => void;

let cachedWindowsInternetSettings: WindowsInternetSettings | null = null;
let cachedStrategyKey = '';
const dispatcherCache = new Map<string, Dispatcher>();
let appProxyConfig: AppProxyConfig = {
  mode: 'system',
  httpProxy: '',
  httpsProxy: '',
  noProxy: '',
};

function trimToString(value: unknown): string {
  return value === undefined || value === null ? '' : String(value).trim();
}

function normalizeProxyUrl(value: unknown): string {
  const raw = trimToString(value);
  if (!raw) return '';
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
    return raw;
  }
  return `http://${raw}`;
}

function redactProxyUrl(value: unknown): string {
  const proxyUrl = trimToString(value);
  if (!proxyUrl) return '';
  try {
    const url = new URL(proxyUrl);
    return `${url.protocol}//${url.host}`;
  } catch {
    return proxyUrl;
  }
}

function queryWindowsInternetSettings(execFn = execFileSync): string {
  try {
    const output = execFn('reg', ['query', WINDOWS_INTERNET_SETTINGS_KEY], {
      encoding: 'utf8',
      windowsHide: true,
    });
    return trimToString(output);
  } catch {
    return '';
  }
}

function parseRegistryValue(output: string, key: string): string {
  const match = output.match(new RegExp(`^\\s*${key}\\s+REG_\\w+\\s+(.+)$`, 'mi'));
  return trimToString(match?.[1]);
}

export function readWindowsInternetSettings(
  queryFn: RegistryQueryFn = queryWindowsInternetSettings,
): WindowsInternetSettings {
  const output = trimToString(queryFn());
  if (!output) {
    return {
      enabled: false,
      proxyServer: '',
      proxyOverride: '',
      autoConfigUrl: '',
    };
  }

  const proxyEnableRaw = parseRegistryValue(output, 'ProxyEnable');
  const enabled = proxyEnableRaw === '0x1' || proxyEnableRaw === '1';

  return {
    enabled,
    proxyServer: parseRegistryValue(output, 'ProxyServer'),
    proxyOverride: parseRegistryValue(output, 'ProxyOverride'),
    autoConfigUrl: parseRegistryValue(output, 'AutoConfigURL'),
  };
}

function getWindowsInternetSettings(): WindowsInternetSettings {
  if (!cachedWindowsInternetSettings) {
    cachedWindowsInternetSettings = readWindowsInternetSettings();
  }
  return cachedWindowsInternetSettings;
}

function getEnvProxyForProtocol(env: EnvLike, protocol: string): string {
  if (!env || typeof env !== 'object') return '';
  const isHttps = protocol === 'https:';
  const candidates = isHttps
    ? [env.HTTPS_PROXY, env.https_proxy, env.HTTP_PROXY, env.http_proxy, env.ALL_PROXY, env.all_proxy]
    : [env.HTTP_PROXY, env.http_proxy, env.ALL_PROXY, env.all_proxy, env.HTTPS_PROXY, env.https_proxy];
  return normalizeProxyUrl(candidates.find((value) => trimToString(value)));
}

function normalizeAppProxyConfig(value: Partial<AppProxyConfig> = {}): AppProxyConfig {
  const mode = value.mode && ['system', 'direct', 'custom'].includes(value.mode) ? value.mode : 'system';
  return {
    mode,
    httpProxy: normalizeProxyUrl(value.httpProxy),
    httpsProxy: normalizeProxyUrl(value.httpsProxy),
    noProxy: trimToString(value.noProxy),
  };
}

export function configureOutboundProxy(value: Partial<AppProxyConfig> = {}): void {
  appProxyConfig = normalizeAppProxyConfig(value);
  cachedStrategyKey = '';
}

function wildcardToRegExp(pattern: string): RegExp {
  return new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`, 'i');
}

function matchesNoProxy(hostname: string, noProxy: string): boolean {
  const host = trimToString(hostname).toLowerCase();
  if (!host) return false;

  return trimToString(noProxy)
    .split(/[;,]/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .some((pattern) => {
      if (pattern === '*') return true;
      if (pattern === '<local>') return !host.includes('.');
      if (pattern.startsWith('.')) return host === pattern.slice(1) || host.endsWith(pattern);
      if (pattern.includes('*')) return wildcardToRegExp(pattern).test(host);
      return host === pattern || host.endsWith(`.${pattern}`);
    });
}

export function selectWindowsProxyServer(proxyServer: string, protocol = 'https:'): string {
  const raw = trimToString(proxyServer);
  if (!raw) return '';

  if (!raw.includes('=')) {
    return normalizeProxyUrl(raw);
  }

  const segments = raw
    .split(';')
    .map((segment) => segment.trim())
    .filter(Boolean);
  const pairs = new Map<string, string>();
  let fallback = '';

  for (const segment of segments) {
    const [key, ...rest] = segment.split('=');
    if (rest.length === 0) {
      fallback ||= normalizeProxyUrl(key);
      continue;
    }
    pairs.set(key.trim().toLowerCase(), normalizeProxyUrl(rest.join('=')));
  }

  if (protocol === 'https:') {
    return pairs.get('https') || pairs.get('http') || fallback;
  }

  return pairs.get('http') || pairs.get('https') || fallback;
}

export function resolveProxyStrategy(
  targetUrl: string | URL,
  env: EnvLike = process.env,
  platform = process.platform,
): ProxyStrategy {
  const parsedTarget = new URL(targetUrl);
  const protocol = parsedTarget.protocol;
  const configuredProxy = normalizeAppProxyConfig(appProxyConfig);

  if (configuredProxy.mode === 'direct') {
    return {
      mode: 'direct',
      proxyUrl: '',
      proxySource: 'app-direct',
    };
  }

  if (configuredProxy.mode === 'custom') {
    if (matchesNoProxy(parsedTarget.hostname, configuredProxy.noProxy)) {
      return {
        mode: 'direct',
        proxyUrl: '',
        proxySource: 'app-no-proxy',
      };
    }

    const proxyUrl =
      protocol === 'https:'
        ? configuredProxy.httpsProxy || configuredProxy.httpProxy
        : configuredProxy.httpProxy || configuredProxy.httpsProxy;
    return {
      mode: proxyUrl ? 'app-custom' : 'direct',
      proxyUrl,
      proxySource: proxyUrl ? 'app-settings' : 'app-custom-empty',
    };
  }

  const envProxyUrl = getEnvProxyForProtocol(env, protocol);
  if (envProxyUrl) {
    return {
      mode: 'env',
      proxyUrl: envProxyUrl,
      proxySource: 'environment',
    };
  }

  if (platform === 'win32') {
    const windowsSettings = getWindowsInternetSettings();
    if (windowsSettings.enabled) {
      const proxyUrl = selectWindowsProxyServer(windowsSettings.proxyServer, protocol);
      if (proxyUrl) {
        return {
          mode: 'windows-registry',
          proxyUrl,
          proxySource: 'windows-registry',
        };
      }

      if (windowsSettings.autoConfigUrl) {
        return {
          mode: 'windows-pac-unsupported',
          proxyUrl: '',
          proxySource: 'windows-autoconfig',
        };
      }
    }
  }

  return {
    mode: 'direct',
    proxyUrl: '',
    proxySource: 'direct',
  };
}

function getStrategyKey(strategy: ProxyStrategy): string {
  return `${strategy.mode}:${strategy.proxyUrl || ''}`;
}

function getDispatcher(strategy: ProxyStrategy): Dispatcher | null {
  if (!strategy.proxyUrl) return null;

  const cacheKey = getStrategyKey(strategy);
  const cached = dispatcherCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const dispatcher =
    strategy.mode === 'env'
      ? new EnvHttpProxyAgent()
      : new ProxyAgent({
          uri: strategy.proxyUrl,
        });
  dispatcherCache.set(cacheKey, dispatcher);
  return dispatcher;
}

function logStrategySelection(strategy: ProxyStrategy): void {
  const strategyKey = getStrategyKey(strategy);
  if (!strategyKey || strategyKey === cachedStrategyKey) {
    return;
  }

  cachedStrategyKey = strategyKey;
  logInfo('outbound proxy strategy selected', {
    mode: strategy.mode,
    proxySource: strategy.proxySource,
    proxyUrl: redactProxyUrl(strategy.proxyUrl),
  });
}

export function getOutboundProxySummary(targetUrl: string | URL): ProxyStrategy {
  const strategy = resolveProxyStrategy(targetUrl);
  return {
    mode: strategy.mode,
    proxySource: strategy.proxySource,
    proxyUrl: redactProxyUrl(strategy.proxyUrl),
  };
}

export async function proxyAwareFetch(targetUrl: string | URL, options: RequestInit = {}): Promise<Response> {
  const strategy = resolveProxyStrategy(targetUrl);
  logStrategySelection(strategy);

  const requestOptions = { ...options } as RequestInit & { dispatcher?: Dispatcher };
  if (!requestOptions.dispatcher) {
    const dispatcher = getDispatcher(strategy);
    if (dispatcher) {
      requestOptions.dispatcher = dispatcher;
    }
  }

  return fetch(targetUrl, requestOptions);
}
