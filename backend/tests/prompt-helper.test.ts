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

test('promptHelper defaults to generic model style for legacy data', async () => {
  const { result } = await helper({
    activeTool: 'camera',
    cameraConfig: { focalLength: 85, shotSize: '特写' },
  });

  assert.match(result.prompt, /转换视角/);
  assert.match(result.prompt, /85mm portrait lens feel/);
  assert.doesNotMatch(result.prompt, /final_prompt/);
  assert.doesNotMatch(result.prompt, /新生成模式/);
});

test('promptHelper camera generate mode outputs fresh-image instructions', async () => {
  const { result } = await helper({
    activeTool: 'camera',
    baseText: '红色机甲武士站在雨夜街头',
    cameraConfig: {
      mode: 'generate',
      focalLength: 35,
      distance: 7,
      angle: 30,
      shotSize: '全景',
      preserveSubject: true,
    },
  });

  assert.match(result.prompt, /基础提示词 \/ base prompt/);
  assert.match(result.prompt, /根据基础提示词新生成一张全景/);
  assert.match(result.prompt, /这是新生成模式，不要求参考原图重绘/);
  assert.match(result.prompt, /保持基础提示词中的主体设定/);
  assert.doesNotMatch(result.prompt, /只改变观看视角/);
});

test('promptHelper camera back view adds explicit rear-view constraints', async () => {
  const { result } = await helper({
    activeTool: 'camera',
    cameraConfig: {
      angle: 180,
      focalLength: 50,
      shotSize: '中景',
    },
  });

  assert.match(result.prompt, /背面视角/);
  assert.match(result.prompt, /back view/);
  assert.match(result.prompt, /face should not be visible/);
  assert.match(result.prompt, /不要生成正面或侧脸/);
});

test('promptHelper camera uses concise GPT-image-2 style when requested', async () => {
  const { result } = await helper({
    activeTool: 'camera',
    modelStyle: 'gpt-image-2',
    cameraConfig: { focalLength: 85, shotSize: '特写' },
  });

  assert.match(result.prompt, /GPT-image-2/);
  assert.match(result.prompt, /Keep the subject identity/);
  assert.match(result.prompt, /Change only the camera view/);
  assert.match(result.prompt, /Do not alter/);
  assert.doesNotMatch(result.prompt, /请严格根据以下结构化提示词/);
});

test('promptHelper camera uses structured Nano Banana style when requested', async () => {
  const { result } = await helper({
    activeTool: 'camera',
    modelStyle: 'nano-banana',
    cameraConfig: { focalLength: 85, shotSize: '特写' },
  });

  assert.match(result.prompt, /请严格根据以下结构化提示词/);
  assert.match(result.prompt, /"task": "image_edit"/);
  assert.match(result.prompt, /"final_prompt"/);
  assert.match(result.prompt, /85mm portrait lens feel/);
});

test('promptHelper camera generate mode uses text_to_image Nano Banana style', async () => {
  const { result } = await helper({
    activeTool: 'camera',
    modelStyle: 'nano-banana',
    cameraConfig: { mode: 'generate', focalLength: 50, shotSize: '中景' },
  });

  assert.match(result.prompt, /请严格根据以下结构化提示词/);
  assert.match(result.prompt, /"task": "text_to_image"/);
  assert.match(result.prompt, /"intent": "生成新视角图片"/);
  assert.doesNotMatch(result.prompt, /"task": "image_edit"/);
});

test('promptHelper camera Nano Banana payload includes explicit viewpoint fields', async () => {
  const { result } = await helper({
    activeTool: 'camera',
    modelStyle: 'nano-banana',
    cameraConfig: { angle: 180, focalLength: 50, shotSize: '中景' },
  });

  assert.match(result.prompt, /"viewpoint_label": "背面视角"/);
  assert.match(result.prompt, /"viewpoint": "back view"/);
  assert.match(result.prompt, /"viewpoint_instruction": "show the back of the subject; face should not be visible"/);
});

test('promptHelper lighting tool distinguishes add and reshape modes', async () => {
  const { result: addResult } = await helper({
    activeTool: 'lighting',
    lightingConfig: {
      mode: 'add',
      lights: [{ id: 'a', name: '轮廓光', type: 'spot', intensity: 2, color: '#ffeeaa' }],
    },
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
      shots: [{ content: '镜头一' }, { content: '镜头二' }, { content: '不应出现' }],
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
      shots: [{ duration: '', content: '', note: '' }, { content: '产品出场' }],
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

test('promptHelper layout defaults to standard three-view template', async () => {
  const { result } = await helper({
    activeTool: 'layout',
    layoutConfig: {},
  });

  assert.match(result.prompt, /版式模板：标准三视图/);
  assert.match(result.prompt, /正面视图/);
  assert.match(result.prompt, /侧面视图/);
  assert.match(result.prompt, /背面视图/);
  assert.match(result.prompt, /orthographic reference sheet style/);
});

test('promptHelper layout product reference keeps product identity constraints', async () => {
  const { result } = await helper({
    activeTool: 'layout',
    modelStyle: 'nano-banana',
    layoutConfig: { template: 'product-reference' },
  });

  assert.match(result.prompt, /产品参考图/);
  assert.match(result.prompt, /Logo\/标签细节/);
  assert.match(result.prompt, /"产品外形"/);
  assert.match(result.prompt, /"不要改变 Logo"/);
  assert.match(result.prompt, /"final_prompt"/);
});

test('promptHelper is registered as a workflow executor', async () => {
  const result = await NODE_EXECUTORS.promptHelper({ data: { activeTool: 'layout' } }, {}, {}, () => {});

  assert.match(result.prompt, /生成三视图/);
});
