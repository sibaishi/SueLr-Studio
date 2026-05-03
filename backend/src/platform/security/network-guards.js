import { URL } from 'node:url';
import net from 'node:net';
import dns from 'node:dns/promises';

import { ProviderError, ValidationError } from '../../app/errors/index.js';

const BLOCKED_HOSTNAMES = new Set(['localhost']);
const BLOCKED_IPV4_RANGES = [
  ['0.0.0.0', '0.255.255.255'],
  ['10.0.0.0', '10.255.255.255'],
  ['100.64.0.0', '100.127.255.255'],
  ['127.0.0.0', '127.255.255.255'],
  ['169.254.0.0', '169.254.255.255'],
  ['172.16.0.0', '172.31.255.255'],
  ['192.0.0.0', '192.0.0.255'],
  ['192.0.2.0', '192.0.2.255'],
  ['192.168.0.0', '192.168.255.255'],
  ['198.18.0.0', '198.19.255.255'],
  ['198.51.100.0', '198.51.100.255'],
  ['203.0.113.0', '203.0.113.255'],
  ['224.0.0.0', '255.255.255.255'],
];
const BLOCKED_METADATA_IPV4 = new Set(['169.254.169.254']);
const BLOCKED_IPV6_PREFIXES = ['::1', 'fc', 'fd', 'fe8', 'fe9', 'fea', 'feb'];
const DNS_CACHE_TTL_MS = 60_000;
const dnsCache = new Map();

function ipv4ToInt(ip) {
  return ip.split('.').reduce((value, part) => ((value << 8) >>> 0) + Number(part), 0) >>> 0;
}

function isBlockedIpv4(ip) {
  if (BLOCKED_METADATA_IPV4.has(ip)) return true;
  const value = ipv4ToInt(ip);
  return BLOCKED_IPV4_RANGES.some(([start, end]) => value >= ipv4ToInt(start) && value <= ipv4ToInt(end));
}

function isBlockedIpv6(ip) {
  const normalized = String(ip || '').trim().toLowerCase();
  if (!normalized) return true;
  if (normalized === '::1') return true;
  return BLOCKED_IPV6_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

function isPrivateOrBlockedIp(ip) {
  const version = net.isIP(ip);
  if (version === 4) return isBlockedIpv4(ip);
  if (version === 6) return isBlockedIpv6(ip);
  return false;
}

function assertProtocol(url, fieldName, { allowHttp = false } = {}) {
  if (url.protocol === 'https:') return;
  if (allowHttp && url.protocol === 'http:') return;
  throw new ValidationError('INVALID_REMOTE_URL', `${fieldName} 仅允许使用 ${allowHttp ? 'HTTP/HTTPS' : 'HTTPS'} 地址`);
}

function isLoopbackHostname(hostname) {
  const normalized = String(hostname || '').trim().toLowerCase();
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1';
}

function isLoopbackAppHost() {
  const host = String(process.env.APP_HOST || '127.0.0.1').trim().toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

function allowsPrivateProviderUrls() {
  return process.env.APP_ALLOW_PRIVATE_PROVIDER_URLS === 'true' || isLoopbackAppHost();
}

function allowsPrivateRemoteDownloadUrls() {
  return process.env.APP_ALLOW_PRIVATE_DOWNLOAD_URLS === 'true' || isLoopbackAppHost();
}

function assertHostname(hostname, fieldName, { allowPrivate = false } = {}) {
  const normalized = String(hostname || '').trim().toLowerCase();
  if (!normalized) {
    throw new ValidationError('INVALID_REMOTE_URL', `${fieldName} 缺少主机名`);
  }
  if (!allowPrivate && BLOCKED_HOSTNAMES.has(normalized)) {
    throw new ValidationError('REMOTE_HOST_FORBIDDEN', `${fieldName} 不允许使用本机或内网地址`);
  }
}

function assertIpAddressAllowed(ip, fieldName, { allowPrivate = false } = {}) {
  if (allowPrivate) return;
  if (net.isIP(ip) === 4 && isBlockedIpv4(ip)) {
    throw new ValidationError('REMOTE_HOST_FORBIDDEN', `${fieldName} 不允许使用本机或内网地址`);
  }
  if (net.isIP(ip) === 6 && isBlockedIpv6(ip)) {
    throw new ValidationError('REMOTE_HOST_FORBIDDEN', `${fieldName} 不允许使用本机或内网地址`);
  }
}

function assertHttpAllowedForTarget(url, fieldName, isPrivateTarget) {
  if (url.protocol !== 'http:') return;
  if (isPrivateTarget) return;
  throw new ValidationError('INVALID_REMOTE_URL', `${fieldName} 仅允许公网使用 HTTPS 地址，HTTP 仅可用于本机或内网服务`);
}

async function resolveHostname(hostname) {
  const cacheKey = String(hostname || '').toLowerCase();
  const cached = dnsCache.get(cacheKey);
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached.addresses;
  }

  const records = await dns.lookup(hostname, { all: true, verbatim: true });
  const addresses = records.map((record) => record.address);
  dnsCache.set(cacheKey, { addresses, expiresAt: now + DNS_CACHE_TTL_MS });
  return addresses;
}

export async function validateRemoteUrl(rawUrl, options = {}) {
  const { fieldName = '远程地址', allowHttp = false, allowPrivate = false } = options;

  let parsed;
  try {
    parsed = new URL(String(rawUrl || '').trim());
  } catch {
    throw new ValidationError('INVALID_REMOTE_URL', `${fieldName} 不是合法 URL`);
  }

  assertProtocol(parsed, fieldName, { allowHttp });
  assertHostname(parsed.hostname, fieldName, { allowPrivate });

  if (parsed.username || parsed.password) {
    throw new ValidationError('INVALID_REMOTE_URL', `${fieldName} 不允许携带用户名或密码`);
  }

  if (net.isIP(parsed.hostname)) {
    const isPrivateTarget = isPrivateOrBlockedIp(parsed.hostname);
    assertIpAddressAllowed(parsed.hostname, fieldName, { allowPrivate });
    assertHttpAllowedForTarget(parsed, fieldName, isPrivateTarget);
    return parsed;
  }

  if (allowPrivate && isLoopbackHostname(parsed.hostname)) {
    assertHttpAllowedForTarget(parsed, fieldName, true);
    return parsed;
  }

  let addresses;
  try {
    addresses = await resolveHostname(parsed.hostname);
  } catch {
    throw new ProviderError('REMOTE_HOST_RESOLUTION_FAILED', `${fieldName} 域名解析失败`);
  }

  if (addresses.length === 0) {
    throw new ProviderError('REMOTE_HOST_RESOLUTION_FAILED', `${fieldName} 域名解析失败`);
  }

  const isPrivateTarget = addresses.some(isPrivateOrBlockedIp);
  for (const address of addresses) {
    assertIpAddressAllowed(address, fieldName, { allowPrivate });
  }
  assertHttpAllowedForTarget(parsed, fieldName, isPrivateTarget);

  return parsed;
}

export async function assertSafeProviderBaseUrl(baseUrl, fieldName = 'Base URL') {
  const allowPrivate = allowsPrivateProviderUrls();
  return validateRemoteUrl(baseUrl, { fieldName, allowHttp: allowPrivate, allowPrivate });
}

export async function assertSafeRemoteDownloadUrl(url, fieldName = '远程资源地址') {
  const allowPrivate = allowsPrivateRemoteDownloadUrls();
  return validateRemoteUrl(url, { fieldName, allowHttp: true, allowPrivate });
}
