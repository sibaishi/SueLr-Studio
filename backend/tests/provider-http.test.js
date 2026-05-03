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
