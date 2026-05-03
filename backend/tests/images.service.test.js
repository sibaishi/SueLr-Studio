import test from 'node:test';
import assert from 'node:assert/strict';

import { ImagesService } from '../src/modules/images/images.service.js';

test('images service uses settings service and image generator', async () => {
  const service = new ImagesService({
    settingsService: {
      buildRuntimeConfig(apiConfig) {
        return {
          apiKey: 'demo-key',
          baseUrl: 'https://example.com/v1',
          providerConfig: { authType: 'bearer' },
          projectModels: [],
          apiConfig,
        };
      },
    },
    async runImageGeneration(body, runtimeConfig) {
      return {
        images: ['data:image/png;base64,abc'],
        request: {
          ...body,
          runtimeBaseUrl: runtimeConfig.baseUrl,
        },
      };
    },
  });

  const result = await service.generate({ prompt: 'draw a cat', apiConfig: { provider: 'demo' } });

  assert.deepEqual(result.images, ['data:image/png;base64,abc']);
  assert.equal(result.request.prompt, 'draw a cat');
  assert.equal(result.request.runtimeBaseUrl, 'https://example.com/v1');
});
