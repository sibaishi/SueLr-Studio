// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';

import { execute } from '../src/engine/nodes/imageCompare.ts';

test('imageCompare accepts image arrays from image generation nodes', async () => {
  const result = await execute(
    {},
    {
      image1: '/api/files/source.png',
      image2: [
        'data:image/png;base64,QUJD',
        'data:image/png;base64,REVG',
      ],
    },
  );

  assert.deepEqual(result, {
    image1: '/api/files/source.png',
    image2: 'data:image/png;base64,QUJD',
  });
});

test('imageCompare treats empty image arrays as missing inputs', async () => {
  await assert.rejects(
    execute(
      {},
      {
        image1: '/api/files/source.png',
        image2: [],
      },
    ),
    /missing required input: image2/,
  );
});
