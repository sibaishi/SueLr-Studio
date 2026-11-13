import { z } from 'zod';

const ref = z.string().trim().min(1).max(200);
const label = z.string().trim().min(1).max(100);
const text = z.string().max(12000);
const planSchema = z
  .object({
    operations: z
      .array(
        z.discriminatedUnion('kind', [
          z
            .object({
              kind: z.literal('add'),
              ref,
              type: z.enum(['io', 'aiV3']),
              label,
              text,
              mode: z.enum(['chat', 'image', 'video']).optional(),
            })
            .strict(),
          z.object({ kind: z.literal('update'), nodeId: ref, label: label.optional(), text: text.optional() }).strict(),
          z
            .object({
              kind: z.literal('configure'),
              nodeId: ref,
              settings: z
                .object({
                  model: ref.optional(),
                  mode: z.enum(['chat', 'image', 'video', 'audio', 'midjourney']).optional(),
                  prompt: text.optional(),
                  systemPrompt: text.optional(),
                  enableWebSearch: z.boolean().optional(),
                  ratio: z
                    .string()
                    .regex(/^(auto|[1-9][0-9]?:[1-9][0-9]?)$/)
                    .optional(),
                  width: z.number().int().min(0).max(8192).optional(),
                  height: z.number().int().min(0).max(8192).optional(),
                  n: z.number().int().min(1).max(8).optional(),
                  imageResolution: z.enum(['auto', '1k', '2k', '4k']).optional(),
                  output_format: z.enum(['png', 'jpeg', 'webp']).optional(),
                  duration: z.number().int().min(1).max(60).optional(),
                  voice: ref.optional(),
                })
                .strict(),
            })
            .strict(),
          z.object({ kind: z.literal('connect'), source: ref, target: ref }).strict(),
          z.object({ kind: z.literal('disconnect'), source: ref, target: ref }).strict(),
          z.object({ kind: z.literal('clear') }).strict(),
          z.object({ kind: z.literal('remove'), nodeId: ref }).strict(),
          z.object({ kind: z.literal('disable'), nodeId: ref, disabled: z.boolean() }).strict(),
          z
            .object({
              kind: z.literal('move'),
              nodeId: ref,
              x: z.number().min(-100000).max(100000),
              y: z.number().min(-100000).max(100000),
            })
            .strict(),
          z.object({ kind: z.literal('run') }).strict(),
        ]),
      )
      .min(1)
      .max(20),
  })
  .strict();

const { $schema: _schema, ...parameters } = z.toJSONSchema(planSchema);

export const canvasTool = {
  type: 'function',
  function: {
    name: 'propose_canvas_changes',
    description:
      '用户要求操作画布时提出方案。add 用 ref 引用新节点，其他节点操作使用现有 ID 或前面 add 的 ref。configure 设置 AI 节点参数。model 必须用上下文提供的模型 value，修改模型会同步模式。清空画布时只用 clear，删除分组会同时删除组内节点。move 使用画布坐标。用户要求运行时将 run 放在最后且只用一次。方案须由用户应用。',
    parameters,
  },
};

export function parseCanvasPlan(calls: unknown) {
  if (!Array.isArray(calls) || calls.length !== 1) return undefined;
  const call = calls[0]?.function;
  if (call?.name !== canvasTool.function.name || typeof call.arguments !== 'string') return undefined;
  try {
    const plan = planSchema.parse(JSON.parse(call.arguments));
    if (plan.operations.slice(0, -1).some(({ kind }) => kind === 'run')) return undefined;
    return plan;
  } catch {
    return undefined;
  }
}
