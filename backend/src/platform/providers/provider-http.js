import { ProviderError } from '../../app/errors/index.js';

function buildSafeFetchFailureMessage(extra) {
  const detail = extra || '未提供更多底层错误信息';
  return `上游 API 请求失败：${detail}。请检查 Base URL、接口路径、网络或代理配置。`;
}

export function formatProviderFetchError(error, url) {
  const fallback = error instanceof Error ? error.message : '连接测试失败';
  const cause = error && typeof error === 'object' ? error.cause : null;
  const causeCode = typeof cause?.code === 'string' ? cause.code : '';
  const causeMessage = typeof cause?.message === 'string' ? cause.message : '';

  if (error?.name === 'TimeoutError') {
    return '连接超时，请检查 Base URL 和网络状态。';
  }
  if (causeCode === 'ECONNREFUSED') {
    return '连接被拒绝，请确认服务地址可访问且端口已开放。';
  }
  if (causeCode === 'ENOTFOUND') {
    return '域名解析失败，请检查 Base URL 是否填写正确。';
  }
  if (causeCode === 'ECONNRESET') {
    return '连接被远端重置，服务可能提前断开了请求。';
  }
  if (causeCode === 'ETIMEDOUT' || causeCode === 'UND_ERR_CONNECT_TIMEOUT') {
    return '连接超时，请检查网络、代理或目标服务响应时间。';
  }
  if (causeCode === 'UND_ERR_ABORTED') {
    return '上游 API 请求被中止，请检查网络、代理或请求超时配置。';
  }
  if (causeCode === 'UND_ERR_SOCKET') {
    return '上游 API 连接中断，请检查网络、代理或上游稳定性。';
  }
  if (causeCode === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' || causeCode === 'CERT_HAS_EXPIRED' || causeCode === 'SELF_SIGNED_CERT_IN_CHAIN') {
    return 'TLS/SSL 证书校验失败，请检查 HTTPS 证书链配置。';
  }
  if (fallback === 'fetch failed') {
    return buildSafeFetchFailureMessage(causeMessage || causeCode);
  }
  return fallback;
}

export async function parseProviderErrorResponse(response, fallbackPrefix) {
  const text = await response.text().catch(() => '');
  const sanitized = text.trim().replace(/\s+/g, ' ').slice(0, 120);
  return sanitized ? `${fallbackPrefix} (${response.status})` : `${fallbackPrefix} (${response.status})`;
}

export function toProviderError(error, code, url = '') {
  if (error?.status) return error;
  return new ProviderError(code, formatProviderFetchError(error, url), undefined, error);
}
