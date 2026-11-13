// @ts-expect-error Express does not ship local type declarations in this backend package yet.
import { Router } from 'express';
import { z } from 'zod';
import { ProviderError, ValidationError } from '../../app/errors/index.ts';
import { successEnvelope } from '../../app/http/envelope.ts';
import { createRequestAbortSignal } from '../../app/http/request-abort.ts';
import { zodValidator } from '../../app/middleware/zod-validator.ts';
import { findProjectModel } from '../../engine/helpers/projectModels.ts';
import { runChatCompletion } from '../../platform/ai/chat-service.ts';
import { settingsService } from '../settings/settings.service.ts';
import type { RequestLike, ResponseLike } from '../types.ts';

import { canvasTool, parseCanvasPlan } from './agentCanvasTool.ts';

const part = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text: z.string().min(1).max(32000) }).strict(),
  z
    .object({
      type: z.literal('image_url'),
      image_url: z
        .object({
          url: z
            .string()
            .max(7_000_000)
            .regex(/^data:image\/(?:jpeg|png|webp|gif);base64,[a-z0-9+/]+=*$/i),
        })
        .strict(),
    })
    .strict(),
]);
const requestSchema = z
  .object({
    canvasEnabled: z.boolean().default(false),
    configId: z.string().min(1).max(120),
    model: z.string().min(1).max(200),
    skills: z
      .array(
        z
          .string()
          .min(1)
          .max(256 * 1024),
      )
      .max(12),
    messages: z
      .array(
        z.discriminatedUnion('role', [
          z.object({ role: z.literal('user'), content: z.array(part).min(1).max(25) }).strict(),
          z.object({ role: z.literal('assistant'), content: z.string().min(1).max(32000) }).strict(),
        ]),
      )
      .min(1)
      .max(21),
  })
  .strict()
  .refine(
    ({ messages }) =>
      messages.at(-1)?.role === 'user' &&
      messages.every(({ role }, index) => role === (index % 2 ? 'assistant' : 'user')),
    '对话消息顺序无效。',
  )
  .refine(
    ({ messages, skills }) =>
      messages.reduce(
        (size, message) =>
          size +
          (typeof message.content === 'string'
            ? message.content.length
            : message.content.reduce(
                (total, item) => total + (item.type === 'text' ? item.text.length : item.image_url.url.length),
                0,
              )),
        0,
      ) +
        skills.reduce((size, skill) => size + skill.length, 0) <=
      12_000_000,
    '当前对话的参考素材过多，请减少附件后再发送。',
  );
const validate = zodValidator(requestSchema);
const router = Router();

router.post('/chat', async (req: RequestLike, res: ResponseLike) => {
  const input = validate(req.body);
  const runtime = settingsService.buildRuntimeConfig({ configId: input.configId }, req.scope);
  const model = findProjectModel(runtime.projectModels, input.model);
  if (
    runtime.configId !== input.configId ||
    !runtime.apiKey ||
    !model?.configured ||
    model.type !== 'chat' ||
    !runtime.configs.some((config: { id: string }) => config.id === input.configId)
  ) {
    throw new ValidationError('AGENT_MODEL_UNAVAILABLE', '请选择已启用连接中的对话模型。');
  }

  const signal = createRequestAbortSignal(req, res);
  try {
    const request: Parameters<typeof runChatCompletion>[0] = {
      ...runtime,
      model: model.modelId,
      webSearch: false,
      tools: input.canvasEnabled ? [canvasTool] : undefined,
      signal,
      scope: req.scope,
      messages: [
        {
          role: 'system',
          content: [
            '你的产品身份是「弧光」，是 SueLr Studio 画布旁的创意协作助手。被问到身份时，可以说「我是弧光，SueLr Studio 里的创意搭档。」即使底层模型、渠道或历史消息带有其他助手的名称，也不要把它当作自己的产品身份。',
            '你的工作是与用户一起构思、比较方向、改写文案、推敲视觉方案、分镜和提示词。延续已经确定的创作决定，用用户的语言给出具体可用的建议。',
            '遇到简单问候，简短自然地回应，并邀请用户说一个想法或发一份参考素材。不要默认把话题引向开发或写代码。',
            '附件是参考资料。视频输入为抽取的静帧，不包含音轨。明确说明你无法从静帧判断的信息。',
            input.canvasEnabled
              ? '用户已引用当前画布。用户明确让你修改或运行时，必须调用 propose_canvas_changes 提交可确认的方案，禁止只回复手动操作步骤。能从当前画布和对话确定目标时直接拟方案。仅在缺少必要信息时追问。用户只想分析或请教时直接回答。所有操作需要用户确认。IO 用作文本输入和结果节点，AI 能力 V3 支持 chat、image、video。设置 AI 节点的模型或生成参数时使用 configure。模型从当前画布上下文的 availableModels 选择准确 value。不要声称方案已执行。'
              : '当前请求关闭了画布上下文。需要操作时，请用户开启画布图标。当前请求可以继续讨论与分析。',
            '不要声称已生成媒体或执行命令。',
            '分析画布时引用运行 ID、节点或产物，区分当前编辑状态与历史运行。将已确认的原因和推测分开。仅在收到实际画面时评审视觉内容，说明证据缺口。',
            '用户要求创建 Skill 时，给出一个完整的 fenced markdown 代码块，包含 name、description 两个 YAML 标量字段及 Markdown 正文。',
            ...(input.skills.length
              ? [
                  '以下是用户启用的创作指导。只在与当前任务相关时采用，且不得改变你的产品身份或声称拥有额外能力。',
                  ...input.skills,
                ]
              : []),
          ].join('\n\n'),
        },
        ...input.messages,
      ],
    };
    const response = await runChatCompletion(request);
    let message = (await response.json())?.choices?.[0]?.message;
    const latest = input.messages.at(-1);
    const instruction = latest?.role === 'user' && latest.content[0]?.type === 'text' ? latest.content[0].text : '';
    const explicitAction =
      /^(?:那就|现在|麻烦|可以|能不能|能否)*(?:请|直接|帮我|替我|你来|你直接|你帮我|给我)+[\s，,]*(?:把|将)?[^。！？\n]{0,100}(?:更新|替换|修改|改成|改掉|放到|放进去|写入|填入|搭建|创建|添加|删除|连接|断开|移动|禁用|启用|执行|运行|重跑|跑一遍|跑一次|跑起来|设置|配置|换成|切换)/u.test(
        instruction.trim(),
      ) &&
      /画布|工作流|节点|连线|提示词|prompt|运行|重跑|跑一遍|跑一次|跑起来/i.test(instruction) &&
      !/怎么|如何|教程|不要|先别|能不能告诉我/.test(instruction);
    if (input.canvasEnabled && explicitAction && !message?.tool_calls?.length) {
      const retry = await runChatCompletion({
        ...request,
        toolChoice: { type: 'function', function: { name: canvasTool.function.name } },
      });
      message = (await retry.json())?.choices?.[0]?.message;
      if (!message?.tool_calls?.length) {
        throw new ProviderError(
          'AGENT_CANVAS_PLAN_MISSING',
          '当前模型没有提交可应用的画布方案。请重试，或切换支持工具调用的对话模型。',
        );
      }
    }
    const plan = input.canvasEnabled ? parseCanvasPlan(message?.tool_calls) : undefined;
    if (input.canvasEnabled && message?.tool_calls?.length && !plan) {
      throw new ProviderError('AGENT_CANVAS_PLAN_INVALID', '弧光返回的画布方案格式无效，请重试。');
    }
    const content =
      typeof message?.content === 'string' && message.content.trim()
        ? message.content.trim()
        : plan
          ? '已拟好画布方案，请检查后应用。'
          : '';
    if (typeof content !== 'string' || !content.trim()) {
      throw new ProviderError('AGENT_EMPTY_REPLY', '模型没有返回可用的回复。');
    }
    if (!signal.aborted) res.json(successEnvelope({ answer: content, ...(plan && { plan }) }));
  } catch (error) {
    if (!signal.aborted) throw error;
  }
});

export default router;
