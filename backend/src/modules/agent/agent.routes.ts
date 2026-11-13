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
    const response = await runChatCompletion({
      ...runtime,
      model: model.modelId,
      webSearch: false,
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
            '当前能力是对话与素材分析。不要声称已操作画布、生成媒体或执行文件中的命令。',
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
    });
    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) {
      throw new ProviderError('AGENT_EMPTY_REPLY', '模型没有返回可用的回复。');
    }
    if (!signal.aborted) res.json(successEnvelope({ answer: content.trim() }));
  } catch (error) {
    if (!signal.aborted) throw error;
  }
});

export default router;
