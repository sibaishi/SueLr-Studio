import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';

import { createRequestAbortSignal } from '../src/app/http/request-abort.js';

test('createRequestAbortSignal ignores request close before response finishes', () => {
  const req = new EventEmitter();
  req.off = req.removeListener.bind(req);
  const res = new EventEmitter();
  res.off = res.removeListener.bind(res);

  const signal = createRequestAbortSignal(req, res);
  req.emit('close');

  assert.equal(signal.aborted, false);

  res.emit('finish');
  res.emit('close');
  assert.equal(signal.aborted, false);
});

test('createRequestAbortSignal aborts when request is aborted', () => {
  const req = new EventEmitter();
  req.off = req.removeListener.bind(req);
  const res = new EventEmitter();
  res.off = res.removeListener.bind(res);

  const signal = createRequestAbortSignal(req, res);
  req.emit('aborted');

  assert.equal(signal.aborted, true);
});
