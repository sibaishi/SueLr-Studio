// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';

import { NODE_EXECUTORS } from '../src/engine/nodes/index.ts';
import { execute } from '../src/engine/nodes/promptHelper.ts';

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
    storyboardConfig: {
      shotCount: 3,
      layoutPreset: 'vertical-3',
      aspectRatio: '9:16',
      stylePreset: 'custom',
      customStyle: '赛博朋克夜景',
      includeShotNumbers: true,
      noText: false,
      continuity: true,
      shots: [
        { content: '开场', note: '悬念', duration: '1s' },
        { content: '冲突', note: '紧张', duration: '2s' },
        { content: '结尾', note: '释放', duration: '3s' },
      ],
    },
  });

  assert.match(result.prompt, /生成 3 格分镜图/);
  assert.match(result.prompt, /版式为3格竖版/);
  assert.match(result.prompt, /整张分镜图画幅比例 9:16/);
  assert.match(result.prompt, /赛博朋克夜景/);
  assert.match(result.prompt, /纯白背景、统一网格、清晰分镜框/);
  assert.match(result.prompt, /可以在每个分镜格的角落或格外侧使用简洁镜头编号/);
  assert.match(result.prompt, /时长：1s/);
  assert.match(result.prompt, /内容：开场/);
  assert.match(result.prompt, /备注：悬念/);
  assert.match(result.prompt, /镜头 1/);
  assert.match(result.prompt, /镜头 3/);
  assert.doesNotMatch(result.prompt, /镜头 4/);
  assert.doesNotMatch(result.prompt, /景别/);
  assert.doesNotMatch(result.prompt, /机位/);
  assert.doesNotMatch(result.prompt, /转场/);
});

test('promptHelper storyboard layout presets lock shot count and whole-sheet aspect ratio', async () => {
  const { result } = await helper({
    activeTool: 'storyboard',
    storyboardConfig: {
      shotCount: 2,
      layoutPreset: 'grid-6',
      aspectRatio: '9:16',
      shots: [
        { content: '镜头一' },
        { content: '镜头二' },
        { content: '镜头三' },
        { content: '镜头四' },
        { content: '镜头五' },
        { content: '镜头六' },
      ],
    },
  });

  assert.match(result.prompt, /生成 6 格分镜图/);
  assert.match(result.prompt, /版式为6格横版/);
  assert.match(result.prompt, /整张分镜图画幅比例 16:9/);
  assert.match(result.prompt, /镜头 6/);
});

test('promptHelper storyboard has separate horizontal and vertical 9-shot presets', async () => {
  const { result: horizontalResult } = await helper({
    activeTool: 'storyboard',
    storyboardConfig: { layoutPreset: 'grid-9', shotCount: 1, aspectRatio: '1:1' },
  });
  const { result: verticalResult } = await helper({
    activeTool: 'storyboard',
    storyboardConfig: { layoutPreset: 'vertical-9', shotCount: 1, aspectRatio: '1:1' },
  });

  assert.match(horizontalResult.prompt, /生成 9 格分镜图/);
  assert.match(horizontalResult.prompt, /版式为9格横版/);
  assert.match(horizontalResult.prompt, /整张分镜图画幅比例 16:9/);
  assert.match(verticalResult.prompt, /生成 9 格分镜图/);
  assert.match(verticalResult.prompt, /版式为9格竖版/);
  assert.match(verticalResult.prompt, /整张分镜图画幅比例 9:16/);
});

test('promptHelper storyboard custom layout keeps editable shot count and aspect ratio', async () => {
  const { result } = await helper({
    activeTool: 'storyboard',
    storyboardConfig: {
      shotCount: 2,
      layoutPreset: 'custom',
      aspectRatio: '2.35:1',
      shots: [
        { content: '镜头一' },
        { content: '镜头二' },
        { content: '不应出现' },
      ],
    },
  });

  assert.match(result.prompt, /生成 2 格分镜图/);
  assert.match(result.prompt, /版式为自定义/);
  assert.match(result.prompt, /整张分镜图画幅比例 2\.35:1/);
  assert.doesNotMatch(result.prompt, /不应出现/);
});

test('promptHelper storyboard keeps legacy shot data compatible', async () => {
  const { result } = await helper({
    activeTool: 'storyboard',
    storyboardConfig: {
      shotCount: 1,
      shots: [{ shotSize: '特写', camera: '固定镜头', action: '展示道具', transition: 'fade' }],
    },
  });

  assert.match(result.prompt, /生成 1 格分镜图/);
  assert.match(result.prompt, /展示道具/);
  assert.match(result.prompt, /备注：固定镜头；特写；fade/);
  assert.match(result.prompt, /画面内不要出现字幕、编号、文字标签、对白气泡或水印/);
});

test('promptHelper storyboard omits empty shot fields', async () => {
  const { result } = await helper({
    activeTool: 'storyboard',
    storyboardConfig: {
      shotCount: 2,
      shots: [
        { duration: '', content: '', note: '' },
        { content: '产品出场' },
      ],
    },
  });

  assert.doesNotMatch(result.prompt, /镜头 1:/);
  assert.match(result.prompt, /镜头 2: 内容：产品出场/);
  assert.doesNotMatch(result.prompt, /时长：/);
  assert.doesNotMatch(result.prompt, /备注：/);
  assert.match(result.prompt, /如果某个镜头没有填写内容、时长或备注/);
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
