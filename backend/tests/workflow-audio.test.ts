import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execute as executeAi } from '../src/engine/nodes/aiV3/index.ts';
import { execute as executeIo } from '../src/engine/nodes/io.ts';
import { getProviderAdapter } from '../src/platform/providers/index.ts';

test('AI V3 routes speech synthesis to the selected config and IO saves an audio asset', async (t) => {
  const adapter = getProviderAdapter();
  const audio = Buffer.from('ID3\x04\x00\x00\x00\x00\x00\x00');
  const request = t.mock.method(adapter, 'jsonRequest', async (options: Parameters<typeof adapter.jsonRequest>[0]) => {
    assert.equal(options.baseUrl, 'https://speech.example.com/v1');
    assert.equal(options.endpoint, '/v1/audio/speech');
    assert.deepEqual(options.body, {
      model: 'test-tts',
      input: '你好\n再见',
      voice: 'nova',
      response_format: 'mp3',
    });
    return new Response(audio, { headers: { 'content-type': 'audio/mpeg' } });
  });

  const generated = await executeAi(
    { data: { model: 'speech::test-tts', mode: 'audio', prompt: '再见', voice: 'nova' } },
    { input: '你好' },
    {
      configs: [
        {
          id: 'speech',
          apiKey: 'mock-key',
          baseUrl: 'https://speech.example.com/v1',
          projectModels: [{ modelId: 'test-tts', type: 'audio' }],
        },
      ],
    },
    undefined,
  );
  assert.equal(request.mock.callCount(), 1);
  assert.equal(generated.result, `data:audio/mpeg;base64,${audio.toString('base64')}`);

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'suelr-test-audio-'));
  const oldRoot = process.env.APP_CONFIG_DIR;
  process.env.APP_CONFIG_DIR = root;
  t.after(() => {
    if (oldRoot === undefined) delete process.env.APP_CONFIG_DIR;
    else process.env.APP_CONFIG_DIR = oldRoot;
    fs.rmSync(root, { recursive: true, force: true });
  });

  const output = await executeIo({ data: {} }, { input: generated.result, _inputTypes: ['aiV3'] }, {}, undefined);
  assert.match(String(output.result), /^\/api\/outputs\/audio\/.+\.mp3$/);
  assert.deepEqual(
    output.savedFiles.map((file) => (file as { type: string }).type),
    ['audio'],
  );
});
