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
  process.env.APP_STORAGE_DIR = createStorageDir('assistant');

  const { AssistantRepository } = await import(`../src/modules/assistant/assistant.repository.js?test=${Date.now()}`);
  const { AssistantService } = await import(`../src/modules/assistant/assistant.service.js?test=${Date.now()}`);

  const repository = new AssistantRepository();
  const service = new AssistantService(repository);

  service.saveConversations([{ id: 'conv-1', title: 'Hello', model: 'gpt-4o', msgs: [], ts: Date.now() }]);
  assert.equal(service.getConversations().length, 1);

  service.saveVideo({ id: 'video-1', url: 'https://example.com/video.mp4', prompt: 'demo', model: 'video-model', ts: Date.now() });
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
