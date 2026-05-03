import test from 'node:test';
import assert from 'node:assert/strict';

import { formatProviderFetchError, parseProviderErrorResponse } from '../src/platform/providers/provider-http.js';

test('provider fetch error formatting does not leak target URL', () => {
  const message = formatProviderFetchError(new Error('fetch failed'), 'https://internal.example.local/v1');
  assert.equal(message.includes('internal.example.local'), false);
});

test('provider error response parsing strips upstream body details', async () => {
  const response = {
    status: 500,
    async text() {
      return 'sensitive upstream response body';
    },
  };

  const message = await parseProviderErrorResponse(response, '上游 API 调用失败');
  assert.equal(message, '上游 API 调用失败 (500)');
});

test('provider fetch error formatting maps timeout transport failures to safe guidance', () => {
  const timeoutError = new Error('fetch failed');
  timeoutError.cause = {
    code: 'ETIMEDOUT',
    message: 'connect ETIMEDOUT 10.0.0.8:443',
  };

  const message = formatProviderFetchError(timeoutError, 'https://internal.example.local/v1/images');
  assert.equal(message.includes('10.0.0.8'), false);
  assert.equal(message.includes('internal.example.local'), false);
  assert.match(message, /timeout|超时/i);
});

test('provider error response parsing ignores structured upstream body content', async () => {
  const response = {
    status: 429,
    async text() {
      return JSON.stringify({
        error: {
          message: 'rate limit for tenant secret-project',
          detail: 'upstream should never leak this',
        },
      });
    },
  };

  const message = await parseProviderErrorResponse(response, '上游 API 调用失败');
  assert.equal(message, '上游 API 调用失败 (429)');
});
