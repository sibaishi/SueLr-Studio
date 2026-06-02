// @ts-nocheck
import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import { execute } from '../src/engine/nodes/imageSplit.ts';

function toDataUrl(buffer, mimeType) {
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

function fromDataUrl(dataUrl) {
  return Buffer.from(String(dataUrl).replace(/^data:[^;]+;base64,/, ''), 'base64');
}

async function split(buffer, data = {}, mimeType = 'image/png') {
  return execute({ data }, { image: toDataUrl(buffer, mimeType) }, {}, () => {});
}

async function metadata(dataUrl) {
  return sharp(fromDataUrl(dataUrl)).metadata();
}

test('imageSplit returns part1 through part9 in row-major order for a 3x3 grid', async () => {
  const source = await sharp({
    create: { width: 10, height: 11, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } },
  })
    .png()
    .toBuffer();
  const result = await split(source, { rows: 3, columns: 3 });

  assert.deepEqual(Object.keys(result), ['part1', 'part2', 'part3', 'part4', 'part5', 'part6', 'part7', 'part8', 'part9']);
  assert.deepEqual(
    await Promise.all(Object.values(result).map(async (value) => {
      const info = await metadata(value);
      return [info.width, info.height];
    })),
    [
      [3, 4], [3, 4], [4, 4],
      [3, 3], [3, 3], [4, 3],
      [3, 4], [3, 4], [4, 4],
    ],
  );
});

test('imageSplit supports a 1x1 crop and preserves the original format when export is stable', async () => {
  const source = await sharp({
    create: { width: 4, height: 2, channels: 3, background: { r: 32, g: 64, b: 128 } },
  })
    .jpeg()
    .toBuffer();
  const result = await split(source, { rows: 1, columns: 1 }, 'image/jpeg');

  assert.deepEqual(Object.keys(result), ['part1']);
  assert.match(result.part1, /^data:image\/jpeg;base64,/);
  const info = await metadata(result.part1);
  assert.deepEqual([info.width, info.height], [4, 2]);
});

test('imageSplit applies EXIF orientation before cropping', async () => {
  const source = await sharp({
    create: { width: 2, height: 3, channels: 3, background: { r: 255, g: 255, b: 255 } },
  })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .toBuffer();
  const result = await split(source, { rows: 1, columns: 1 }, 'image/jpeg');
  const info = await metadata(result.part1);

  assert.deepEqual([info.width, info.height], [3, 2]);
});

test('imageSplit preserves transparency', async () => {
  const source = await sharp(Buffer.from([255, 0, 0, 0, 0, 255, 0, 128]), {
    raw: { width: 2, height: 1, channels: 4 },
  })
    .png()
    .toBuffer();
  const result = await split(source, { rows: 1, columns: 2 });
  const left = await sharp(fromDataUrl(result.part1)).raw().toBuffer();
  const right = await sharp(fromDataUrl(result.part2)).raw().toBuffer();

  assert.equal(left[3], 0);
  assert.equal(right[3], 128);
});

test('imageSplit rejects images smaller than the requested grid', async () => {
  const source = await sharp({
    create: { width: 2, height: 2, channels: 3, background: { r: 255, g: 255, b: 255 } },
  })
    .png()
    .toBuffer();

  await assert.rejects(() => split(source, { rows: 3, columns: 2 }), /每块图片必须至少为 1px x 1px/);
});

test('imageSplit processes only the first animated image frame', async () => {
  const animatedGif = Buffer.from(
    '47494638396101000100800000000000ffffff21f90400000000002c000000000100010000020244010021f90400000000002c00000000010001000002024c01003b',
    'hex',
  );
  const result = await split(animatedGif, { rows: 1, columns: 1 }, 'image/gif');
  const info = await metadata(result.part1);

  assert.equal(info.pages ?? 1, 1);
  assert.deepEqual([info.width, info.height], [1, 1]);
});

test('imageSplit falls back to PNG when the source format cannot be exported stably', async () => {
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><rect width="2" height="2" fill="red"/></svg>');
  const result = await split(svg, { rows: 1, columns: 1 }, 'image/svg+xml');

  assert.match(result.part1, /^data:image\/png;base64,/);
  assert.equal((await metadata(result.part1)).format, 'png');
});
