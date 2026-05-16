import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import sharp from 'sharp';

import { execute } from '../src/engine/nodes/maskInput.js';
import { STORAGE_PATHS } from '../src/platform/storage/index.js';

test('maskInput outputs a transparent mask with black opaque regions for a white source', async () => {
  const tempFile = path.join(os.tmpdir(), `mask-input-${Date.now()}.png`);
  const source = await sharp({
    create: {
      width: 4,
      height: 2,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .png()
    .toBuffer();

  fs.writeFileSync(tempFile, source);

  const fileUrl = `file://${tempFile}`;
  const progress = [];
  const result = await execute({ data: { fileUrl, threshold: 128, invertMask: false } }, {}, {}, (message) => progress.push(message));

  assert.equal(typeof result.mask, 'string');
  assert.match(result.mask, /^\/api\/files\/.+_mask\.png$/);
  assert.equal(progress[0], '读取遮罩源图片...');

  const outputPath = path.join(STORAGE_PATHS.uploadsDir, result.mask.replace('/api/files/', ''));
  const metadata = await sharp(outputPath).metadata();
  const pixel = await sharp(outputPath).raw().toBuffer({ resolveWithObject: true });

  assert.equal(metadata.channels, 4);
  assert.deepEqual(Array.from(pixel.data.slice(0, 4)), [0, 0, 0, 0]);
});
