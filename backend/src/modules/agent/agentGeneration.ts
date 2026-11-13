import { z } from 'zod';
import { ValidationError } from '../../app/errors/index.ts';
import { findProjectModel } from '../../engine/helpers/projectModels.ts';
import { runImageGeneration } from '../../platform/ai/image-service.ts';
import { executeVideoGeneration } from '../../platform/ai/video-service.ts';
import type { RequestScope } from '../../platform/runtime/request-scope.ts';
import { settingsService } from '../settings/settings.service.ts';

const planSchema = z
  .object({
    kind: z.enum(['image', 'video']),
    prompt: z.string().trim().min(1).max(12000),
    ratio: z
      .string()
      .regex(/^(auto|[1-9][0-9]?:[1-9][0-9]?)$/)
      .optional(),
    count: z.number().int().min(1).max(4).optional(),
    duration: z.number().int().min(1).max(60).optional(),
  })
  .strict();

export const generationRequest = z
  .object({
    configId: z.string().min(1).max(120),
    model: z.string().min(1).max(200),
    plan: planSchema,
  })
  .strict();

const { $schema: _schema, ...parameters } = z.toJSONSchema(planSchema);
export const generationTool = {
  type: 'function',
  function: {
    name: 'propose_direct_generation',
    description:
      '用户要求直接生成图片或视频时提出待确认的生成方案，输出将在对话中展示。仅使用文字提示词。count 用于图片，duration 用于视频。',
    parameters,
  },
};

export function parseGenerationPlan(calls: unknown) {
  if (!Array.isArray(calls) || calls.length !== 1) return undefined;
  const call = calls[0]?.function;
  if (call?.name !== generationTool.function.name || typeof call.arguments !== 'string') return undefined;
  try {
    return planSchema.parse(JSON.parse(call.arguments));
  } catch {
    return undefined;
  }
}

export async function generateAgentMedia(
  input: z.infer<typeof generationRequest>,
  scope: RequestScope | undefined,
  signal: AbortSignal,
) {
  const runtime = settingsService.buildRuntimeConfig({ configId: input.configId }, scope);
  const model = findProjectModel(runtime.projectModels, input.model);
  if (
    runtime.configId !== input.configId ||
    !runtime.apiKey ||
    !model?.configured ||
    model.type !== input.plan.kind ||
    !runtime.configs.some((config: { id: string }) => config.id === input.configId)
  ) {
    throw new ValidationError('AGENT_GENERATION_MODEL_UNAVAILABLE', '请选择已启用连接中对应类型的生成模型。');
  }
  const { kind, prompt, ratio, count, duration } = input.plan;
  const config = { ...runtime, scope, abortSignal: signal };
  if (kind === 'image') {
    const result = (await runImageGeneration({ model: model.modelId, prompt, ratio, n: count ?? 1 }, config)) as {
      images: string[];
    };
    return { kind, urls: result.images };
  }
  const result = await executeVideoGeneration({ model: model.modelId, prompt, aspect_ratio: ratio, duration }, config);
  return { kind, urls: [result.video] };
}
