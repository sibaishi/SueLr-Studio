// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';

import { execute } from '../src/engine/nodes/textSplit.ts';

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
    part2: '乙\n\n##\n\n丙\n\n丁',
  });
  assert.deepEqual(progress, ['拆分文本...']);
});

test('textSplit preserves untouched tail content when it cannot split further', async () => {
  const source = 'A\n\n##\n\nB\n\n##\n\nC\n\nD';
  const { result } = await split(source, { separator: '##', outputCount: 3 });

  assert.deepEqual(result, {
    part1: 'A',
    part2: 'B',
    part3: 'C\n\nD',
  });
});

test('textSplit uses local segments when upstream text is empty', async () => {
  const { result } = await split('', { outputCount: 3, segments: ['A', 'B', 'C'] });

  assert.deepEqual(result, {
    part1: 'A',
    part2: 'B',
    part3: 'C',
  });
});

test('textSplit upstream text takes precedence over local segments', async () => {
  const { result } = await split('A##\n\nB', { separator: '##', outputCount: 2, segments: ['local A', 'local B'] });

  assert.deepEqual(result, {
    part1: 'A',
    part2: 'B',
  });
});

test('textSplit preserves final segment internal and trailing newlines', async () => {
  const { result } = await split('A##\n\nB\n\nC\n', { separator: '##', outputCount: 2 });

  assert.deepEqual(result, {
    part1: 'A',
    part2: 'B\n\nC\n',
  });
});
