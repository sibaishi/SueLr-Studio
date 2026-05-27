// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';

import { errorHandler } from '../src/app/middleware/error-handler.ts';

test('error handler returns unified envelope', () => {
  let statusCode = 200;
  let body = null;
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(payload) {
      body = payload;
      return this;
    },
  };

  errorHandler({ status: 404, code: 'WORKFLOW_NOT_FOUND', message: '工作流不存在' }, {}, res, () => {});

  assert.equal(statusCode, 404);
  assert.deepEqual(body, {
    success: false,
    error: {
      code: 'WORKFLOW_NOT_FOUND',
      message: '工作流不存在',
    },
  });
});

test('error handler hides provider internals from client responses', () => {
  let statusCode = 200;
  let body = null;
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(payload) {
      body = payload;
      return this;
    },
  };

  errorHandler({
    status: 502,
    code: 'PROVIDER_REQUEST_FAILED',
    message: '获取模型失败 (500): upstream stack trace',
    details: { upstream: 'secret' },
    stack: 'stack content',
  }, {}, res, () => {});

  assert.equal(statusCode, 502);
  assert.deepEqual(body, {
    success: false,
    error: {
      code: 'PROVIDER_REQUEST_FAILED',
      message: '上游服务请求失败，请检查配置或稍后重试',
    },
  });
});
