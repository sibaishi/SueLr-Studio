import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';

import { materializeContentForOutput } from '../src/engine/helpers/saveHelper.js';

test('materializeContentForOutput keeps remote asset URLs without downloading them again', async () => {
  const originalFetch = globalThis.fetch;
  const remoteUrl = 'https://example.com/generated-image.png';
  let fetchCalled = false;

  globalThis.fetch = async () => {
    fetchCalled = true;
    throw new Error('fetch should not be called for remote output URLs');
  };

  try {
    const result = await materializeContentForOutput([remoteUrl], { prefix: 'output-test' });

    assert.equal(fetchCalled, false);
    assert.deepEqual(result.content, [remoteUrl]);
    assert.equal(result.savedFiles.length, 1);
    assert.equal(result.savedFiles[0].type, 'text');
    assert.equal(result.savedPaths.length, 1);
    assert.equal(fs.readFileSync(result.savedPaths[0], 'utf-8'), remoteUrl);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
