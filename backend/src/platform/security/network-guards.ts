import dns from 'node:dns/promises';
import net from 'node:net';
import { URL } from 'node:url';

import { ProviderError, ValidationError } from '../../app/errors/index.ts';

interface RemoteUrlValidationOptions {
  fieldName?: string;
  allowHttp?: boolean;
  allowPrivate?: boolean;
  /** 允许公网 HTTP 下载（下载后将通过内容 magic bytes 验证兜底） */
  allowPublicHttp?: boolean;
}

interface DnsCacheEntry {
  addresses: string[];
  expiresAt: number;
}

const BLOCKED_HOSTNAMES = new Set(['localhost']);
const BLOCKED_IPV4_RANGES: Array<readonly [string, string]> = [
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
const dnsCache = new Map<string, DnsCacheEntry>();

function ipv4ToInt(ip: string): number {
  return ip.split('.').reduce((value, part) => ((value << 8) >>> 0) + Number(part), 0) >>> 0;
}

function isBlockedIpv4(ip: string): boolean {
  if (BLOCKED_METADATA_IPV4.has(ip)) return true;
  const value = ipv4ToInt(ip);
  return BLOCKED_IPV4_RANGES.some(([start, end]) => value >= ipv4ToInt(start) && value <= ipv4ToInt(end));
}

function isBlockedIpv6(ip: string): boolean {
  const normalized = String(ip || '')
    .trim()
    .toLowerCase();
  if (!normalized) return true;
  if (normalized === '::1') return true;
  return BLOCKED_IPV6_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

function isPrivateOrBlockedIp(ip: string): boolean {
  const version = net.isIP(ip);
  if (version === 4) return isBlockedIpv4(ip);
  if (version === 6) return isBlockedIpv6(ip);
  return false;
}

function assertProtocol(url: URL, fieldName: string, { allowHttp = false }: RemoteUrlValidationOptions = {}): void {
  if (url.protocol === 'https:') return;
  if (allowHttp && url.protocol === 'http:') return;
  throw new ValidationError('INVALID_REMOTE_URL', `${fieldName} 仅允许使用 ${allowHttp ? 'HTTP/HTTPS' : 'HTTPS'} 地址`);
}

function isLoopbackHostname(hostname: string): boolean {
  const normalized = String(hostname || '')
    .trim()
    .toLowerCase();
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1';
}

function isLoopbackAppHost(): boolean {
  const host = String(process.env.APP_HOST || '127.0.0.1')
    .trim()
    .toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

function allowsPrivateProviderUrls(): boolean {
  return process.env.APP_ALLOW_PRIVATE_PROVIDER_URLS === 'true' || isLoopbackAppHost();
}

function allowsPrivateRemoteDownloadUrls(): boolean {
  return process.env.APP_ALLOW_PRIVATE_DOWNLOAD_URLS === 'true' || isLoopbackAppHost();
}

function assertHostname(
  hostname: string,
  fieldName: string,
  { allowPrivate = false }: RemoteUrlValidationOptions = {},
): void {
  const normalized = String(hostname || '')
    .trim()
    .toLowerCase();
  if (!normalized) {
    throw new ValidationError('INVALID_REMOTE_URL', `${fieldName} 缺少主机名`);
  }
  if (!allowPrivate && BLOCKED_HOSTNAMES.has(normalized)) {
    throw new ValidationError('REMOTE_HOST_FORBIDDEN', `${fieldName} 不允许使用本机或内网地址`);
  }
}

function assertIpAddressAllowed(
  ip: string,
  fieldName: string,
  { allowPrivate = false }: RemoteUrlValidationOptions = {},
): void {
  if (allowPrivate) return;
  if (net.isIP(ip) === 4 && isBlockedIpv4(ip)) {
    throw new ValidationError('REMOTE_HOST_FORBIDDEN', `${fieldName} 不允许使用本机或内网地址`);
  }
  if (net.isIP(ip) === 6 && isBlockedIpv6(ip)) {
    throw new ValidationError('REMOTE_HOST_FORBIDDEN', `${fieldName} 不允许使用本机或内网地址`);
  }
}

function assertHttpAllowedForTarget(
  url: URL,
  fieldName: string,
  isPrivateTarget: boolean,
  allowPublicHttp = false,
): void {
  if (url.protocol !== 'http:') return;
  if (isPrivateTarget) return;
  if (allowPublicHttp) return;
  throw new ValidationError(
    'INVALID_REMOTE_URL',
    `${fieldName} 仅允许公网使用 HTTPS 地址，HTTP 仅可用于本机或内网服务`,
  );
}

async function resolveHostname(hostname: string): Promise<string[]> {
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

export async function validateRemoteUrl(rawUrl: string | URL, options: RemoteUrlValidationOptions = {}): Promise<URL> {
  const { fieldName = '远程地址', allowHttp = false, allowPrivate = false, allowPublicHttp = false } = options;

  let parsed: URL;
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
    assertHttpAllowedForTarget(parsed, fieldName, isPrivateTarget, allowPublicHttp);
    return parsed;
  }

  if (allowPrivate && isLoopbackHostname(parsed.hostname)) {
    assertHttpAllowedForTarget(parsed, fieldName, true, allowPublicHttp);
    return parsed;
  }

  let addresses: string[];
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
  assertHttpAllowedForTarget(parsed, fieldName, isPrivateTarget, allowPublicHttp);

  return parsed;
}

export async function assertSafeProviderBaseUrl(baseUrl: string | URL, fieldName = 'Base URL'): Promise<URL> {
  const allowPrivate = allowsPrivateProviderUrls();
  return validateRemoteUrl(baseUrl, { fieldName, allowHttp: allowPrivate, allowPrivate });
}

export async function assertSafeRemoteDownloadUrl(url: string | URL, fieldName = '远程资源地址'): Promise<URL> {
  const allowPrivate = allowsPrivateRemoteDownloadUrls();
  return validateRemoteUrl(url, { fieldName, allowHttp: true, allowPrivate, allowPublicHttp: true });
}

// ── 图片内容安全验证 ──────────────────────────────────────────

const IMAGE_MAGIC_SIGNATURES: Array<{ signature: number[]; label: string }> = [
  { signature: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], label: 'PNG' },
  { signature: [0xff, 0xd8, 0xff], label: 'JPEG' },
  { signature: [0x47, 0x49, 0x46, 0x38], label: 'GIF' },
  { signature: [0x52, 0x49, 0x46, 0x46], label: 'WebP' },
  { signature: [0x00, 0x00, 0x01, 0x00], label: 'ICO' },
  { signature: [0x42, 0x4d], label: 'BMP' },
];

function matchMagic(buffer: Buffer, signature: number[], minLen: number): boolean {
  if (buffer.byteLength < minLen) return false;
  return signature.every((byte, i) => buffer[i] === byte);
}

/**
 * 验证二进制内容是否为合法图片格式（基于文件头 magic bytes）。
 * 作为 HTTP 明文下载的内容安全兜底：即使攻击者替换了响应体，
 * 非图片数据也无法通过此检查。
 */
export function validateImageBuffer(buffer: Buffer): void {
  if (buffer.byteLength < 8) {
    throw new ValidationError('INVALID_IMAGE_CONTENT', '下载内容过小，不是合法图片');
  }

  for (const { signature, label } of IMAGE_MAGIC_SIGNATURES) {
    if (label === 'WebP') {
      // RIFF 容器需额外验证偏移 8 处的 WEBP 标识
      if (
        matchMagic(buffer, signature, 12) &&
        buffer[8] === 0x57 &&
        buffer[9] === 0x45 &&
        buffer[10] === 0x42 &&
        buffer[11] === 0x50
      ) {
        return;
      }
      continue;
    }
    if (matchMagic(buffer, signature, signature.length)) return;
  }

  const hex = buffer.slice(0, 16).toString('hex');
  throw new ValidationError('INVALID_IMAGE_CONTENT', `下载内容不是合法图片格式（文件头: ${hex}）`);
}
