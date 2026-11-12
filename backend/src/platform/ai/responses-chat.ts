import { ProviderError } from '../../app/errors/index.ts';
import type { DynamicValue } from '../../modules/types.ts';

function toInputPart(part: DynamicValue, role: string) {
  if (part?.type === 'image_url') {
    return { type: 'input_image', image_url: part.image_url?.url, detail: part.image_url?.detail ?? 'auto' };
  }
  if (part?.type === 'text') {
    return { type: role === 'assistant' ? 'output_text' : 'input_text', text: part.text };
  }
  return part;
}

export function buildResponsesChatBody(
  model: string,
  messages: DynamicValue[],
  tools: DynamicValue[] = [],
  maxTokens?: number,
) {
  const input = messages.flatMap((message): DynamicValue[] => {
    if (message?.role === 'tool') {
      return [{ type: 'function_call_output', call_id: message.tool_call_id, output: message.content ?? '' }];
    }

    const items: DynamicValue[] = [];
    if (message?.content != null) {
      const content = Array.isArray(message.content)
        ? message.content.map((part: DynamicValue) => toInputPart(part, message.role))
        : message.content;
      items.push({ role: message.role, content });
    }
    for (const call of message?.tool_calls || []) {
      items.push({
        type: 'function_call',
        call_id: call.id,
        name: call.function?.name,
        arguments: call.function?.arguments,
      });
    }
    return items;
  });

  return {
    model,
    input,
    store: false,
    tools: [
      { type: 'web_search' },
      ...tools.map((tool) =>
        tool?.type === 'function' && tool.function ? { ...tool.function, type: 'function' } : tool,
      ),
    ],
    ...(typeof maxTokens === 'number' ? { max_output_tokens: maxTokens } : {}),
  };
}

export async function toChatCompletionResponse(response: Response): Promise<Response> {
  const result: DynamicValue = await response.json();
  if (result.error || !Array.isArray(result.output)) {
    throw new ProviderError('CHAT_FAILED', '原生联网接口未返回有效的 Responses API 结果');
  }
  const texts: string[] = [];
  const sources = new Set<string>();
  const toolCalls: DynamicValue[] = [];
  for (const item of result.output) {
    if (item.type === 'function_call') {
      toolCalls.push({
        id: item.call_id,
        type: 'function',
        function: { name: item.name, arguments: item.arguments },
      });
    }
    if (item.type !== 'message') continue;
    for (const part of item.content || []) {
      if (part.type === 'refusal' && part.refusal) texts.push(part.refusal);
      if (part.type !== 'output_text') continue;
      if (part.text) texts.push(part.text);
      for (const annotation of part.annotations || []) {
        if (annotation.type === 'url_citation' && /^https?:\/\/[^\s<>]+$/i.test(annotation.url || '')) {
          sources.add(annotation.url);
        }
      }
    }
  }
  if (!texts.length && !toolCalls.length) {
    throw new ProviderError('CHAT_FAILED', '原生联网接口未返回可用的对话内容');
  }

  const content = texts.join('\n');
  const sourceList = [...sources].map((url, index) => `[${index + 1}](<${url}>)`).join(' · ');
  return Response.json({
    id: result.id,
    model: result.model,
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: sourceList ? `${content}\n\n来源：${sourceList}` : content,
          ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
        },
        finish_reason: toolCalls.length ? 'tool_calls' : result.status === 'incomplete' ? 'length' : 'stop',
      },
    ],
  });
}
