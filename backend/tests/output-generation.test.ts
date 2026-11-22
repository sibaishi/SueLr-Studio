import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execute as executeAi } from '../src/engine/nodes/ai/index.ts';
import { execute as executeIo } from '../src/engine/nodes/io.ts';
import { recordGenerationResult } from '../src/engine/nodes/ai/generation-record.ts';
import { FilesRepository } from '../src/modules/files/files.repository.ts';
import { generationValueKey, readOutputGeneration, writeOutputGeneration, type GenerationRecords } from '../src/platform/media/output-generation.ts';
import { getProviderAdapter } from '../src/platform/providers/index.ts';

test('generation snapshots survive AI → IO → output listing without credentials or current-node drift', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'suelr-generation-'));
  const oldRoot = process.env.APP_CONFIG_DIR;
  process.env.APP_CONFIG_DIR = root;
  t.after(() => {
    if (oldRoot === undefined) delete process.env.APP_CONFIG_DIR;
    else process.env.APP_CONFIG_DIR = oldRoot;
    fs.rmSync(root, { recursive: true, force: true });
  });
  t.mock.method(getProviderAdapter(), 'jsonRequest', async () => new Response(Buffer.from('ID3test'), {headers: {'content-type': 'audio/mpeg'}}));
  const generationRecords: GenerationRecords = new Map();
  const config = {runId: 'run-1', generationWorkflowId: 'workflow-1', generationRecords,
    configs: [{id: 'speech', apiKey: 'never-persist-this-key', baseUrl: 'https://speech.example/v1', projectModels: [{modelId: 'test-tts', type: 'audio'}]}]};
  const data = {model: 'speech::test-tts', mode: 'audio', prompt: '再见', voice: 'nova'};
  const generated = await executeAi({id: 'ai-1', data}, {input: '你好'}, config, undefined);
  data.prompt = '后来修改的提示词';
  const output = await executeIo({data: {}}, {input: generated.result, _inputTypes: ['ai']}, config, undefined);
  assert.match(String(output.result), /^\/api\/outputs\/audio\//);
  const repository = new FilesRepository();
  const files = await repository.listGeneratedOutputs();
  assert.equal(files.length, 1);
  const record = files[0].generation;
  assert.equal(record.prompt, '你好\n再见');
  assert.equal(record.nodeId, 'ai-1');
  assert.equal(record.workflowId, 'workflow-1');
  assert.equal(record.parameters.model, 'speech::test-tts');
  assert.equal(record.parameters.voice, 'nova');
  assert.equal(record.parameters.mode, 'audio');
  assert.ok(!JSON.stringify(record).includes('never-persist-this-key'));
  generationRecords.clear();
  assert.deepEqual((await new FilesRepository().listGeneratedOutputs())[0].generation, record);
  assert.equal(readOutputGeneration('../escape'), null);
  writeOutputGeneration(String(files[0].relativePath), {} as never);
  assert.equal((await repository.listGeneratedOutputs())[0].generation, null);
  repository.clearGeneratedOutputs();
  assert.equal(readOutputGeneration(String(files[0].relativePath)), null);
});

test('different nodes producing identical content never get a misleading generation owner', () => {
  const generationRecords: GenerationRecords = new Map();
  const config = {generationRecords, generationNodeId: 'first'};
  const output = {result: ['same-content', 'other-content']};
  assert.equal(recordGenerationResult(output, {prompt: '第一次', mode: 'image', apiKey: 'secret'}, [], {model: 'enabled-model'}, config), output);
  assert.equal(generationRecords.get(generationValueKey('same-content'))?.prompt, '第一次');
  recordGenerationResult({result: 'same-content'}, {prompt: '第二次'}, [], {}, {...config, generationNodeId: 'second'});
  assert.equal(generationRecords.get(generationValueKey('same-content')), null);
  assert.equal(generationRecords.get(generationValueKey('other-content'))?.prompt, '第一次');
});
