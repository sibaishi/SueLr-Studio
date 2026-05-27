// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { filesRepository } from '../src/modules/files/files.repository.ts';
import { urlToLocalPath } from '../src/engine/helpers/fileHelper.ts';
import { STORAGE_PATHS, ensureStorageDirectories } from '../src/platform/storage/index.ts';

test('files repository decodes mojibake upload names safely', () => {
  assert.equal(filesRepository.decodeOriginalName('sample.png'), 'sample.png');
  const mojibake = Buffer.from('测试.png', 'utf8').toString('latin1');
  assert.equal(filesRepository.decodeOriginalName(mojibake), '测试.png');
});

test('file helper resolves encoded upload and output URLs', () => {
  ensureStorageDirectories();
  const uploadsName = '中文 文件.png';
  const outputsName = path.join('nested', '测试结果.txt');
  const uploadPath = path.join(STORAGE_PATHS.uploadsDir, uploadsName);
  const outputPath = path.join(STORAGE_PATHS.generatedDir, outputsName);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(uploadPath, 'x');
  fs.writeFileSync(outputPath, 'x');

  try {
    assert.equal(urlToLocalPath(`/api/files/${encodeURIComponent(uploadsName)}`), uploadPath);
    assert.equal(urlToLocalPath(`/api/outputs/nested/${encodeURIComponent('测试结果.txt')}`), outputPath);
  } finally {
    fs.rmSync(uploadPath, { force: true });
    fs.rmSync(outputPath, { force: true });
  }
});
