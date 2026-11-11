// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createTestServer, requestJson } from './helpers/runtime-test.ts';

test('asset library indexes history, persists organization, validates requests and preserves originals', async (t) => {
  const runtime = await createTestServer('asset-library');
  t.after(async () => {
    await new Promise((resolve) => runtime.server.close(resolve));
    runtime.restoreEnv();
    fs.rmSync(runtime.root, { recursive: true, force: true });
  });
  const { getScopedStoragePaths } = await import('../src/platform/storage/index.ts');
  const storage = getScopedStoragePaths();
  const nested = path.join(storage.generatedDir, 'history');
  fs.mkdirSync(nested, { recursive: true });
  fs.mkdirSync(path.join(nested, '.thumbnails'), { recursive: true });
  fs.writeFileSync(path.join(nested, '旧结果.txt'), '历史结果');
  fs.utimesSync(path.join(nested, '旧结果.txt'), new Date(0), new Date(0));
  fs.writeFileSync(path.join(nested, '.thumbnails', 'excluded.jpg'), 'thumbnail');
  fs.symlinkSync(path.join(nested, '旧结果.txt'), path.join(nested, 'excluded.txt'));
  fs.mkdirSync(storage.uploadsDir, { recursive: true });
  fs.writeFileSync(path.join(storage.uploadsDir, 'recording.webm'), 'audio');
  const { uploadMetadataRepository } = await import('../src/modules/files/upload-metadata.repository.ts');
  uploadMetadataRepository.set('recording.webm', { fileName: '旁白.webm', mimeType: 'audio/webm' });
  const listed = await requestJson(runtime.baseUrl, '/api/assets');
  assert.equal(listed.status, 200);
  assert.equal(listed.body.data.libraryTotal, 2);
  const text = listed.body.data.items.find((a) => a.type === 'text');
  const audio = listed.body.data.items.find((a) => a.type === 'audio');
  assert.equal(audio.name, '旁白.webm');
  assert.equal(text.source, 'generated');
  assert.match(text.url, /history\/%/);
  const original = await fetch(runtime.baseUrl + text.url);
  assert.equal(await original.text(), '历史结果');

  const saved = await requestJson(runtime.baseUrl, `/api/assets/${text.id}`, { method: 'PATCH', body: JSON.stringify({
    name: '分镜参考', category: '参考素材', tags: ['夜景', '夜景'], favorite: true,
  }) });
  assert.equal(saved.status, 200);
  assert.deepEqual(saved.body.data.tags, ['夜景']);
  assert.equal(fs.readFileSync(path.join(nested, '旧结果.txt'), 'utf8'), '历史结果');
  const filtered = await requestJson(runtime.baseUrl, '/api/assets?search=夜景&category=参考素材&favorite=true&source=generated&type=text&page=999');
  assert.equal(filtered.body.data.total, 1);
  assert.equal(filtered.body.data.page, 1);
  assert.equal(filtered.body.data.items[0].name, '分镜参考');
  assert.equal(filtered.body.data.items[0].originalName, '旧结果.txt');
  assert.deepEqual(filtered.body.data.categories, ['参考素材']);
  const { listAssets, assetQuerySchema } = await import('../src/modules/files/asset-library.ts?reload');
  assert.equal(listAssets(assetQuerySchema.parse({ favorite: 'true' })).items[0].id, text.id);
  const missing = await requestJson(runtime.baseUrl, `/api/assets/${'0'.repeat(64)}`, { method: 'PATCH', body: '{}' });
  assert.equal(missing.status, 404);
  for (const url of ['/api/assets?page=0', '/api/assets?type=unknown', '/api/assets?favorite=yes']) {
    assert.equal((await requestJson(runtime.baseUrl, url)).status, 400);
  }
  for (const body of [{ name: '' }, { favorite: 'true' }, { tags: ['x'.repeat(41)] }, { unknown: 'field' }]) {
    assert.equal((await requestJson(runtime.baseUrl, `/api/assets/${text.id}`, { method: 'PATCH', body: JSON.stringify(body) })).status, 400);
  }
  for (let i = 0; i < 51; i++) fs.writeFileSync(path.join(nested, `page-${i}.txt`), 'page');
  const page2 = await requestJson(runtime.baseUrl, '/api/assets?page=2');
  assert.equal(page2.body.data.items.length, 5);
  assert.equal(page2.body.data.total, 53);
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
  for (const directory of [storage.generatedDir, nested]) {
    fs.writeFileSync(path.join(directory, 'thumbnail-root.png'), png);
  }
  const thumbnails = await requestJson(runtime.baseUrl, '/api/assets?search=thumbnail-root');
  assert.equal(thumbnails.body.data.total, 2);
  for (const asset of thumbnails.body.data.items) {
    const thumbnail = await fetch(runtime.baseUrl + asset.thumbnailUrl);
    assert.equal(thumbnail.status, 200);
    assert.match(thumbnail.headers.get('content-type'), /image\/jpeg/);
    assert.equal((await fetch(runtime.baseUrl + asset.thumbnailUrl)).status, 200);
  }
  const batch = (body) => requestJson(runtime.baseUrl, '/api/assets/batch', {
    method: 'POST', body: JSON.stringify(body),
  });
  const patch = { category: '批量分类', tags: ['共同标签', '共同标签'] };
  const ids = [text.id, audio.id];
  assert.equal((await batch({ action: 'edit', ids, patch: {} })).status, 400);
  assert.equal((await batch({ action: 'edit', ids: [text.id, '0'.repeat(64)], patch })).status, 404);
  assert.equal(listAssets(assetQuerySchema.parse({ search: '分镜参考' })).items[0].category, '参考素材');
  assert.equal((await batch({ action: 'edit', ids, patch })).body.data.count, 2);
  const edited = listAssets(assetQuerySchema.parse({ category: '批量分类' })).items;
  assert.equal(edited.length, 2);
  assert.ok(edited.every((asset) => asset.tags.join() === '共同标签'));
  assert.equal(edited.find((asset) => asset.id === text.id).favorite, true);
  assert.equal((await batch({ action: 'remove', ids: [text.id, '0'.repeat(64)] })).status, 404);
  assert.equal(listAssets(assetQuerySchema.parse({ category: '批量分类' })).total, 2);
  assert.equal((await batch({ action: 'remove', ids })).body.data.count, 2);
  assert.equal((await batch({ action: 'remove', ids })).body.data.count, 2);
  assert.equal((await requestJson(runtime.baseUrl, '/api/assets/invalid', { method: 'DELETE' })).status, 400);
  assert.equal((await requestJson(runtime.baseUrl, `/api/assets/${'0'.repeat(64)}`, { method: 'DELETE' })).status, 404);
  for (const asset of [text, audio]) {
    const endpoint = `/api/assets/${asset.id}`;
    assert.equal((await requestJson(runtime.baseUrl, endpoint, { method: 'DELETE' })).status, 200);
    assert.equal((await requestJson(runtime.baseUrl, endpoint, { method: 'DELETE' })).status, 200);
    assert.equal((await fetch(runtime.baseUrl + asset.url)).status, 200);
  }
  const afterRemoval = listAssets(assetQuerySchema.parse({}));
  assert.equal(afterRemoval.libraryTotal, 53);
  assert.deepEqual(afterRemoval.categories, []);
  assert.ok(!afterRemoval.items.some((asset) => asset.id === text.id || asset.id === audio.id));
  assert.equal((await requestJson(runtime.baseUrl, `/api/assets/${text.id}`, {
    method: 'PATCH', body: '{"favorite":false}',
  })).status, 404);
  const metadataPath = path.join(storage.filesDir, 'asset-library.json');
  fs.writeFileSync(metadataPath, '{broken');
  const corrupt = await requestJson(runtime.baseUrl, `/api/assets/${text.id}`, { method: 'PATCH', body: '{"favorite":false}' });
  assert.equal(corrupt.status, 400);
  assert.equal(fs.readFileSync(metadataPath, 'utf8'), '{broken');
});
