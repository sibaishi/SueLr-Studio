// @ts-nocheck
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import sharp from 'sharp';

import { readImageDimensions } from '../src/modules/files/image-metadata.ts';

test('readImageDimensions returns dimensions for supported images and null for invalid files', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'suelr-image-metadata-'));
  const imagePath = path.join(root, 'sample.png');
  const invalidPath = path.join(root, 'invalid.png');

  try {
    await sharp({
      create: {
        width: 7,
        height: 5,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .png()
      .toFile(imagePath);
    fs.writeFileSync(invalidPath, 'not-an-image');

    assert.deepEqual(await readImageDimensions(imagePath), { width: 7, height: 5 });
    assert.equal(await readImageDimensions(invalidPath), null);
    assert.equal(await readImageDimensions(path.join(root, 'missing.png')), null);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
