import test from 'node:test';
import assert from 'node:assert/strict';

import { NODE_EXECUTORS } from '../src/engine/nodes/index.js';
import { execute } from '../src/engine/nodes/promptHelper.js';

async function helper(data = {}, inputs = {}) {
  const progress = [];
  const result = await execute({ data }, inputs, {}, (message) => progress.push(message));
  return { result, progress };
}

test('promptHelper camera tool outputs prompt without upstream text', async () => {
  const { result, progress } = await helper({
    activeTool: 'camera',
    cameraConfig: { focalLength: 50, distance: 8, angle: 35, shotSize: '近景' },
  });

  assert.match(result.prompt, /转换视角/);
  assert.match(result.prompt, /50mm/);
  assert.match(result.prompt, /近景/);
  assert.deepEqual(progress, ['生成辅助提示词...']);
});

test('promptHelper includes upstream text before tool prompt', async () => {
  const { result } = await helper({ activeTool: 'camera', baseText: 'local text' }, { text: 'upstream subject' });

  assert.match(result.prompt, /upstream subject/);
  assert.doesNotMatch(result.prompt, /local text/);
});

test('promptHelper lighting tool distinguishes add and reshape modes', async () => {
  const { result: addResult } = await helper({
    activeTool: 'lighting',
    lightingConfig: { mode: 'add', lights: [{ id: 'a', name: '轮廓光', type: 'spot', intensity: 2, color: '#ffeeaa' }] },
  });
  const { result: reshapeResult } = await helper({
    activeTool: 'lighting',
    lightingConfig: { mode: 'reshape', lights: [{ id: 'b', name: '主光', type: 'directional', intensity: 1 }] },
  });

  assert.match(addResult.prompt, /增加光线/);
  assert.match(addResult.prompt, /轮廓光/);
  assert.match(addResult.prompt, /spot light/);
  assert.match(reshapeResult.prompt, /重塑光线/);
});

test('promptHelper storyboard outputs requested shot count', async () => {
  const { result } = await helper({
    activeTool: 'storyboard',
    storyboardConfig: { shotCount: 3, shots: [{ action: '开场' }, { action: '冲突' }, { action: '结尾' }] },
  });

  assert.match(result.prompt, /生成 3 格分镜图/);
  assert.match(result.prompt, /镜头 1/);
  assert.match(result.prompt, /镜头 3/);
  assert.doesNotMatch(result.prompt, /镜头 4/);
});

test('promptHelper layout outputs white background and block positions', async () => {
  const { result } = await helper({
    activeTool: 'layout',
    layoutConfig: { blocks: [{ label: '正面', x: 10, y: 20, w: 30, h: 40 }] },
  });

  assert.match(result.prompt, /纯白背景/);
  assert.match(result.prompt, /无文字内容/);
  assert.match(result.prompt, /正面/);
  assert.match(result.prompt, /10%\/20%/);
});

test('promptHelper is registered as a workflow executor', async () => {
  const result = await NODE_EXECUTORS.promptHelper({ data: { activeTool: 'layout' } }, {}, {}, () => {});

  assert.match(result.prompt, /生成三视图/);
});
