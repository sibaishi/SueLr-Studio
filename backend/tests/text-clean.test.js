import test from 'node:test';
import assert from 'node:assert/strict';

import { NODE_EXECUTORS } from '../src/engine/nodes/index.js';
import { execute } from '../src/engine/nodes/textClean.js';

async function clean(text, data = {}) {
  const progress = [];
  const result = await execute({ data }, { text }, {}, (message) => progress.push(message));
  return { result, progress };
}

test('textClean removes think ranges with default tokens', async () => {
  const { result, progress } = await clean('前文\n<think>推理内容</think>\n正文');

  assert.deepEqual(result, { text: '前文\n\n正文' });
  assert.deepEqual(progress, ['清理文本...']);
});

test('textClean removes all complete matching ranges by default', async () => {
  const { result } = await clean('A<think>one</think>B<think>two</think>C');

  assert.deepEqual(result, { text: 'ABC' });
});

test('textClean keeps unmatched start token content unchanged', async () => {
  const source = 'A<think>unfinished';
  const { result } = await clean(source);

  assert.deepEqual(result, { text: source });
});

test('textClean can keep boundary tokens while removing inner content', async () => {
  const { result } = await clean('A<think>inner</think>B', {
    removeStartToken: false,
    removeEndToken: false,
  });

  assert.deepEqual(result, { text: 'A<think></think>B' });
});

test('textClean can stop after the first matching range', async () => {
  const { result } = await clean('A<think>one</think>B<think>two</think>C', {
    removeAllRanges: false,
  });

  assert.deepEqual(result, { text: 'AB<think>two</think>C' });
});

test('textClean supports custom delimiters', async () => {
  const { result } = await clean('keep [[remove me]] keep', {
    startToken: '[[',
    endToken: ']]',
  });

  assert.deepEqual(result, { text: 'keep  keep' });
});

test('textClean is registered as a workflow executor', async () => {
  const result = await NODE_EXECUTORS.textClean(
    { data: {} },
    { text: 'A<think>remove</think>B' },
    {},
    () => {},
  );

  assert.deepEqual(result, { text: 'AB' });
});
