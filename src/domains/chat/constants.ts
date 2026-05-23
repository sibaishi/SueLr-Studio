import type { AgentRole, ToolDefinition } from '@/shared/types';

export const VIDEO_GENERATION_ENABLED = true;

const CAPABILITY_SUFFIX = `

你具备以下能力：
- 可以生成全新的图片。
- 可以基于已有图片进行修改，调用 generate_image 时传入 reference_image_url。
- 可以将图片生成视频，调用 video_generate 时传入 image_url。
- 可以搜索互联网获取实时信息，调用 web_search。

当用户要求修改已有图片时，不要说无法编辑，而是用参考图重新生成。`;

export const PRESET_ROLES: AgentRole[] = [
  {
    id: 'default',
    name: '通用助手',
    icon: 'bot',
    systemPrompt: '你是一位智能、友好、高效的 AI 助手。回答自然、清晰、可靠。' + CAPABILITY_SUFFIX,
    tools: ['generate_image', 'generate_video'],
  },
  {
    id: 'image',
    name: '图像创作',
    icon: 'palette',
    systemPrompt: '你擅长视觉创意、提示词优化、图像生成和图像改写。' + CAPABILITY_SUFFIX,
    tools: ['generate_image'],
  },
  {
    id: 'video',
    name: '视频导演',
    icon: 'clapperboard',
    systemPrompt: '你擅长把想法转化为视频镜头、运动、节奏和画面说明。' + CAPABILITY_SUFFIX,
    tools: ['generate_image', 'generate_video'],
  },
  {
    id: 'research',
    name: '研究助手',
    icon: 'search',
    systemPrompt: '你擅长信息检索、归纳、比较和引用来源。需要实时信息时主动搜索。',
    tools: ['web_search'],
  },
];

export const MEMORY_PROMPT =
  '分析以下对话内容，提取关于用户的关键信息和偏好。返回 JSON 字符串数组；没有值得记住的信息时返回 []。\n\n对话内容：\n';

export function buildTools(hasImage: boolean, hasVideo: boolean, hasSearch = false) {
  const tools: ToolDefinition[] = [];

  if (hasImage) {
    tools.push({
      type: 'function',
      function: {
        name: 'generate_image',
        description: 'Generate or edit an image. Use reference_image_url when editing an existing image.',
        parameters: {
          type: 'object',
          properties: {
            prompt: { type: 'string', description: 'Image generation or edit prompt.' },
            reference_image_url: { type: 'string', description: 'Optional reference image URL.' },
            width: { type: 'number', description: 'Optional output width in pixels. Will be rounded to the nearest multiple of 16.' },
            height: { type: 'number', description: 'Optional output height in pixels. Will be rounded to the nearest multiple of 16.' },
            resolution: { type: 'string', description: 'Optional output tier: auto, 512px, 1k, 2k, 4k.' },
          },
          required: ['prompt'],
        },
      },
    });
  }

  if (hasVideo && VIDEO_GENERATION_ENABLED) {
    tools.push({
      type: 'function',
      function: {
        name: 'video_generate',
        description: 'Submit a video generation task.',
        parameters: {
          type: 'object',
          properties: {
            prompt: { type: 'string' },
            image_url: { type: 'string' },
            duration: { type: 'number' },
            aspect_ratio: { type: 'string' },
          },
          required: ['prompt'],
        },
      },
    });
  }

  if (hasSearch) {
    tools.push({
      type: 'function',
      function: {
        name: 'web_search',
        description: 'Search the web for current information.',
        parameters: {
          type: 'object',
          properties: { query: { type: 'string' } },
          required: ['query'],
        },
      },
    });
  }

  tools.push({
    type: 'function',
    function: {
      name: 'get_current_time',
      description: 'Get the current date and time.',
      parameters: { type: 'object', properties: { timezone: { type: 'string' } } },
    },
  });

  tools.push({
    type: 'function',
    function: {
      name: 'search_memory',
      description: 'Search remembered user preferences and facts.',
      parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
    },
  });

  tools.push({
    type: 'function',
    function: {
      name: 'analyze_image',
      description: 'Analyze an image in the current conversation.',
      parameters: {
        type: 'object',
        properties: {
          image_url: { type: 'string' },
          prompt: { type: 'string' },
        },
      },
    },
  });

  tools.push({
    type: 'function',
    function: {
      name: 'summarize_conversation',
      description: 'Summarize the current conversation.',
      parameters: { type: 'object', properties: { focus: { type: 'string' } } },
    },
  });

  return tools;
}
