// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import { AgentRunner } from '../src/modules/intelligence/runtime/agent-runner.ts';

const plannerModel = {
  id: 'planner-model',
  modelId: 'planner-model',
  configId: 'planner-config',
  label: 'planner-model · Default',
};

const imageModel = {
  id: 'image-model',
  modelId: 'gpt-image-1',
  configId: 'image-config',
  label: 'gpt-image-1 · Image',
};

const videoModel = {
  id: 'video-model',
  modelId: 'seedance2.0',
  configId: 'video-config',
  label: 'seedance2.0 · Video',
};

function createRunnerWithPlan(plan) {
  const calls = [];
  const runner = new AgentRunner({
    planner: {
      async createPlan() {
        return plan;
      },
    },
    skills: {
      get(id) {
        return { id, requiresApproval: false };
      },
      async run(id, input) {
        calls.push({ id, input });
        return { skillId: id, output: { ok: true, input } };
      },
    },
    traces: {
      create(input) {
        return { id: 'trace_test', ...input };
      },
    },
  });
  return { runner, calls };
}

test('AgentRunner injects selected image model into image.generate tool input', async () => {
  const { runner, calls } = createRunnerWithPlan({
    id: 'plan_image_generate',
    source: 'llm',
    plannerModel,
    imageModel,
    videoModel,
    summary: '准备生成图片',
    toolName: 'image.generate',
    toolInput: {
      prompt: '一只猫的 1:1 实拍照片',
      ratio: '1:1',
    },
    reasoningSummary: '用户要求单张图片生成。',
    warnings: [],
    knowledgeContext: { source: 'test', items: [] },
  });

  const result = await runner.run({
    input: '帮我生成一只猫的 1:1 实拍照片',
    plannerModel,
    imageModel,
    videoModel,
    context: {},
  });

  assert.equal(result.plan.imageModel?.modelId, 'gpt-image-1');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].id, 'image.generate');
  assert.equal(calls[0].input.modelId, 'gpt-image-1');
  assert.equal(calls[0].input.configId, 'image-config');
  assert.equal(calls[0].input.prompt, '一只猫的 1:1 实拍照片');
});

test('AgentRunner injects selected video model into video.generate tool input', async () => {
  const { runner, calls } = createRunnerWithPlan({
    id: 'plan_video_generate',
    source: 'llm',
    plannerModel,
    imageModel,
    videoModel,
    summary: '准备生成视频',
    toolName: 'video.generate',
    toolInput: {
      prompt: '一只猫在草地上奔跑的短视频',
      ratio: '16:9',
    },
    reasoningSummary: '用户要求单次视频生成。',
    warnings: [],
    knowledgeContext: { source: 'test', items: [] },
  });

  const result = await runner.run({
    input: '帮我生成一个 16:9 的猫咪奔跑短视频',
    plannerModel,
    imageModel,
    videoModel,
    context: {},
  });

  assert.equal(result.plan.videoModel?.modelId, 'seedance2.0');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].id, 'video.generate');
  assert.equal(calls[0].input.modelId, 'seedance2.0');
  assert.equal(calls[0].input.configId, 'video-config');
  assert.equal(calls[0].input.prompt, '一只猫在草地上奔跑的短视频');
});
