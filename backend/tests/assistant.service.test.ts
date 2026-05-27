// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';

function createStorageDir(name) {
  const root = path.resolve('C:/Users/ADMINI~1.WIN/AppData/Local/Temp/opencode', `phase2-${name}-${Date.now()}`);
  fs.mkdirSync(root, { recursive: true });
  return root;
}

test('assistant service persists records through repository layer', async () => {
  const root = createStorageDir('assistant');
  process.env.APP_CONFIG_DIR = root;
  process.env.APP_STORAGE_BOOTSTRAP_FILE = path.join(root, 'config', 'bootstrap.json');
  process.env.APP_DISABLE_LEGACY_STORAGE_MIGRATION = '1';

  const { AssistantRepository } = await import(`../src/modules/assistant/assistant.repository.ts?test=${Date.now()}`);
  const { AssistantService } = await import(`../src/modules/assistant/assistant.service.ts?test=${Date.now()}`);

  const repository = new AssistantRepository();
  const service = new AssistantService(repository);

  service.saveConversations([{ id: 'conv-1', title: 'Hello', model: 'gpt-4o', msgs: [], ts: Date.now() }]);
  assert.equal(service.getConversations().length, 1);

  await service.saveVideo({ id: 'video-1', url: 'https://example.com/video.mp4', prompt: 'demo', model: 'video-model', ts: Date.now() });
  assert.equal(service.getVideos().length, 1);

  const image = service.saveImage({
    id: 'img-1',
    prompt: 'test',
    model: 'image-model',
    ts: Date.now(),
    url: '',
    localUrl: '',
    data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wn3lmsAAAAASUVORK5CYII=',
  });

  assert.equal(typeof image.localUrl, 'string');
  assert.equal(service.getImages().length, 1);

  service.deleteConversation('conv-1');
  service.deleteVideo('video-1');
  service.deleteImage('img-1');

  assert.equal(service.getConversations().length, 0);
  assert.equal(service.getVideos().length, 0);
  assert.equal(service.getImages().length, 0);
});

test('assistant service downloads the first playable candidate video url', async () => {
  const root = createStorageDir('assistant-video-candidates');
  process.env.APP_CONFIG_DIR = root;
  process.env.APP_STORAGE_BOOTSTRAP_FILE = path.join(root, 'config', 'bootstrap.json');
  process.env.APP_DISABLE_LEGACY_STORAGE_MIGRATION = '1';

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url) === 'https://example.com/result') {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (String(url) === 'https://93.184.216.34/final.mp4') {
      return new Response(Buffer.from('VIDEO'), {
        status: 200,
        headers: { 'content-type': 'video/mp4' },
      });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  try {
    const { AssistantRepository } = await import(`../src/modules/assistant/assistant.repository.ts?test=${Date.now()}`);
    const { AssistantService } = await import(`../src/modules/assistant/assistant.service.ts?test=${Date.now()}`);

    const repository = new AssistantRepository();
    const service = new AssistantService(repository);

    const saved = await service.saveVideo({
      id: 'video-candidates',
      url: 'https://example.com/result',
      candidateUrls: [
        'https://example.com/result',
        'https://93.184.216.34/final.mp4',
      ],
      prompt: 'demo',
      model: 'video-model',
      ts: Date.now(),
    });

    assert.match(saved.localUrl, /^\/api\/assistant\/files\/assistant-videos\/video-candidates\.mp4$/);
    assert.equal(service.getVideos().length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
