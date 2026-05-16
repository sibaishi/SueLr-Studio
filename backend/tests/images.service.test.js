import test from 'node:test';
import assert from 'node:assert/strict';

import { ImagesService } from '../src/modules/images/images.service.js';
import { CapabilitiesService } from '../src/modules/capabilities/capabilities.service.js';

test('images service uses settings service and image generator', async () => {
  const abortController = new AbortController();
  let receivedRuntimeConfig = null;
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
      receivedRuntimeConfig = runtimeConfig;
      return {
        images: ['data:image/png;base64,abc'],
        request: {
          ...body,
          runtimeBaseUrl: runtimeConfig.baseUrl,
        },
      };
    },
  });

  const result = await service.generate(
    { prompt: 'draw a cat', apiConfig: { provider: 'demo' } },
    { signal: abortController.signal },
  );

  assert.deepEqual(result.images, ['data:image/png;base64,abc']);
  assert.equal(result.request.prompt, 'draw a cat');
  assert.equal(result.request.runtimeBaseUrl, 'https://example.com/v1');
  assert.equal(receivedRuntimeConfig.abortSignal, abortController.signal);
});

test('capabilities service delegates image generation to images service', async () => {
  const body = { model: 'demo-image-model', prompt: 'draw a dog' };
  const abortController = new AbortController();
  let receivedBody = null;
  let receivedOptions = null;

  const service = new CapabilitiesService({
    imagesService: {
      async generate(payload, options) {
        receivedBody = payload;
        receivedOptions = options;
        return {
          images: ['https://example.com/generated.png'],
          request: { model: payload.model },
        };
      },
    },
  });

  const result = await service.image(body, { signal: abortController.signal });

  assert.equal(receivedBody, body);
  assert.equal(receivedOptions.signal, abortController.signal);
  assert.deepEqual(result, {
    images: ['https://example.com/generated.png'],
    request: { model: 'demo-image-model' },
  });
});
