import type { AgentRole } from '@/shared/types';

export type AgentProfile = {
  id: string;
  name: string;
  icon?: string;
  description?: string;
  instruction: string;
  enabledTools: string[];
  defaultModel?: string;
  behavior?: {
    responseStyle?: string;
    memoryMode?: string;
  };
  isCustom?: boolean;
};

const CAPABILITY_SUFFIX = `

你具备以下能力：
- 可以生成全新的图片。
- 可以基于已有图片进行修改。
- 可以将图片生成视频。
- 可以在需要实时信息时搜索互联网。

当用户要求修改已有图片时，不要说无法编辑，而是使用参考图重新生成。`;

export const PRESET_ROLES: AgentRole[] = [
  {
    id: 'default',
    name: '通用助手',
    icon: 'bot',
    systemPrompt: `你是一位智能、友好、高效的 AI 助手。回答自然、清晰、可靠。${CAPABILITY_SUFFIX}`,
    tools: ['generate_image', 'generate_video'],
  },
  {
    id: 'image',
    name: '图像创作',
    icon: 'palette',
    systemPrompt: `你擅长视觉创意、提示词优化、图像生成和图像改写。${CAPABILITY_SUFFIX}`,
    tools: ['generate_image'],
  },
  {
    id: 'video',
    name: '视频导演',
    icon: 'clapperboard',
    systemPrompt: `你擅长把想法转化为视频镜头、运动、节奏和画面说明。${CAPABILITY_SUFFIX}`,
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
