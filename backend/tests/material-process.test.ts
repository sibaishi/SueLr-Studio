// @ts-nocheck
import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import { execute, processMaterial } from '../src/engine/nodes/materialProcess.ts';

function toDataUrl(buffer, mimeType = 'image/png') {
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

function fromDataUrl(dataUrl) {
  return Buffer.from(String(dataUrl).replace(/^data:[^;]+;base64,/, ''), 'base64');
}

test('materialProcess splits text while preserving the final remainder', async () => {
  const result = await execute(
    {
      data: {
        materialType: 'text',
        splitEnabled: true,
        iterateEnabled: false,
        separator: '##',
        outputCount: 2,
      },
    },
    { input: 'A\n\n##\n\nB\n\n##\n\nC\n' },
    {},
    () => {},
  );

  assert.deepEqual(result, { result: ['A', 'B\n\n##\n\nC\n'] });
});

test('materialProcess supports iterate-only scalar and array inputs', async () => {
  const node = { data: { materialType: 'text', splitEnabled: false, iterateEnabled: true } };
  assert.equal(await processMaterial(node, 'A', {}), 'A');
  assert.deepEqual(await processMaterial(node, ['A', 'B'], {}), ['A', 'B']);
});

test('materialProcess keeps every image value unchanged in iterate-only mode', async () => {
  const images = Array.from({ length: 9 }, (_, index) => `https://example.com/image-${index + 1}.png`);
  const result = await processMaterial(
    { data: { materialType: 'image', splitEnabled: false, iterateEnabled: true } },
    images,
    {},
  );

  assert.deepEqual(result, images);
});

test('materialProcess rejects disabled processing and manual type mismatches', async () => {
  await assert.rejects(
    () => processMaterial({ data: { splitEnabled: false, iterateEnabled: false } }, 'A', {}),
    /至少启用/,
  );
  await assert.rejects(
    () =>
      processMaterial({ data: { materialType: 'image', splitEnabled: true, iterateEnabled: false } }, 'plain text', {}),
    /未找到可处理的图像素材/,
  );
});

test('materialProcess filters mixed inputs by the explicitly selected material type', async () => {
  const mixed = ['第一段文本', 'https://example.com/generated-image', '第二段文本'];

  assert.deepEqual(
    await processMaterial({ data: { materialType: 'text', splitEnabled: false, iterateEnabled: true } }, mixed, {}),
    ['第一段文本', '第二段文本'],
  );
  assert.deepEqual(
    await processMaterial({ data: { materialType: 'image', splitEnabled: false, iterateEnabled: true } }, mixed, {}),
    ['https://example.com/generated-image'],
  );
});

test('materialProcess auto mode requires one recognizable material type', async () => {
  await assert.rejects(
    () =>
      processMaterial(
        { data: { materialType: 'auto', splitEnabled: false, iterateEnabled: true } },
        ['文本', 'https://example.com/image-without-extension'],
        {},
      ),
    /检测到混合素材/,
  );
});

test('materialProcess splits images in row-major order and preserves transparency', async () => {
  const source = await sharp(Buffer.from([255, 0, 0, 0, 0, 255, 0, 128, 0, 0, 255, 255, 255, 255, 255, 64]), {
    raw: { width: 2, height: 2, channels: 4 },
  })
    .png()
    .toBuffer();

  const result = await execute(
    {
      data: {
        materialType: 'image',
        splitEnabled: true,
        iterateEnabled: false,
        rows: 2,
        columns: 2,
      },
    },
    { input: toDataUrl(source) },
    {},
    () => {},
  );

  assert.equal(result.result.length, 4);
  const alphaValues = await Promise.all(
    result.result.map(async (part) => (await sharp(fromDataUrl(part)).raw().toBuffer())[3]),
  );
  assert.deepEqual(alphaValues, [0, 128, 255, 64]);
});

test('materialProcess applies EXIF orientation and rejects grids larger than the image', async () => {
  const oriented = await sharp({
    create: { width: 2, height: 3, channels: 3, background: { r: 255, g: 255, b: 255 } },
  })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .toBuffer();
  const result = await processMaterial(
    { data: { materialType: 'image', splitEnabled: true, rows: 1, columns: 1 } },
    toDataUrl(oriented, 'image/jpeg'),
    {},
  );
  const metadata = await sharp(fromDataUrl(result[0])).metadata();
  assert.deepEqual([metadata.width, metadata.height], [3, 2]);

  const tiny = await sharp({
    create: { width: 1, height: 1, channels: 3, background: { r: 255, g: 255, b: 255 } },
  })
    .png()
    .toBuffer();
  await assert.rejects(
    () =>
      processMaterial(
        { data: { materialType: 'image', splitEnabled: true, rows: 2, columns: 1 } },
        toDataUrl(tiny),
        {},
      ),
    /至少为 1px x 1px/,
  );
});
