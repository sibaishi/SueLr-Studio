import test from 'node:test';
import assert from 'node:assert/strict';

import { execute } from '../src/engine/nodes/textSplit.js';

async function split(text, data = {}) {
  const progress = [];
  const result = await execute({ data }, { text }, {}, (message) => progress.push(message));
  return { result, progress };
}

test('textSplit keeps remainder text intact after the final split', async () => {
  const source = '甲\n\n##\n\n乙\n\n##\n\n丙\n\n丁';
  const { result, progress } = await split(source, { separator: '##', outputCount: 2 });

  assert.deepEqual(result, {
    part1: '甲',
    part2: '\n\n乙\n\n##\n\n丙\n\n丁',
  });
  assert.deepEqual(progress, ['拆分文本...']);
});

test('textSplit preserves untouched tail content when it cannot split further', async () => {
  const source = 'A\n\n##\n\nB\n\n##\n\nC\n\nD';
  const { result } = await split(source, { separator: '##', outputCount: 3 });

  assert.deepEqual(result, {
    part1: 'A',
    part2: 'B',
    part3: '\n\nC\n\nD',
  });
});
