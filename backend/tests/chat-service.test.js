import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { ensureStorageDirectories, STORAGE_PATHS } from '../src/platform/storage/index.js';
import { normalizeChatMessagesForUpstream } from '../src/platform/ai/chat-service.js';

function withTempStorage() {
  const previous = process.env.APP_CONFIG_DIR;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'suelr-chat-service-'));
  process.env.APP_CONFIG_DIR = root;
  ensureStorageDirectories();
  return () => {
    if (previous === undefined) {
      delete process.env.APP_CONFIG_DIR;
    } else {
      process.env.APP_CONFIG_DIR = previous;
    }
    fs.rmSync(root, { recursive: true, force: true });
  };
}

test('normalizeChatMessagesForUpstream converts local API image URLs to data URLs', () => {
  const cleanup = withTempStorage();
  try {
    fs.writeFileSync(path.join(STORAGE_PATHS.uploadsDir, 'sample.png'), Buffer.from('ABC'));
    fs.mkdirSync(path.join(STORAGE_PATHS.generatedDir, 'assistant-images'), { recursive: true });
    fs.writeFileSync(path.join(STORAGE_PATHS.generatedDir, 'assistant-images', 'saved.webp'), Buffer.from('WEBP'));

    const messages = normalizeChatMessagesForUpstream([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'describe these' },
          { type: 'image_url', image_url: { url: '/api/files/sample.png' } },
          { type: 'image_url', image_url: { url: 'http://localhost:3000/api/assistant/files/assistant-images/saved.webp' } },
        ],
      },
    ]);

    assert.equal(messages[0].content[1].image_url.url, 'data:image/png;base64,QUJD');
    assert.equal(messages[0].content[2].image_url.url, 'data:image/webp;base64,V0VCUA==');
  } finally {
    cleanup();
  }
});

test('normalizeChatMessagesForUpstream leaves remote and existing data image URLs unchanged', () => {
  const dataUrl = 'data:image/png;base64,QUJD';
  const remoteUrl = 'https://example.com/image.png';

  const messages = normalizeChatMessagesForUpstream([
    {
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: dataUrl } },
        { type: 'image_url', image_url: { url: remoteUrl } },
      ],
    },
  ]);

  assert.equal(messages[0].content[0].image_url.url, dataUrl);
  assert.equal(messages[0].content[1].image_url.url, remoteUrl);
});
