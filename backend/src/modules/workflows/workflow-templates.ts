const TEMPLATE_TIMESTAMP = 1777980000000;

function node(id: string, type: string, x: number, y: number, data = {}) {
  return {
    id,
    type,
    version: 1,
    position: { x, y },
    data,
  };
}

function edge(id: string, source: string, sourceHandle: string, target: string, targetHandle: string) {
  return {
    id,
    source,
    sourceHandle,
    target,
    targetHandle,
  };
}

export const BUILTIN_WORKFLOW_TEMPLATES = [
  {
    id: 'starter_text_to_image',
    name: '基础文生图',
    description: '输入一段提示词，调用图像模型生成图片，并在结果面板中查看输出。',
    version: 1,
    createdAt: TEMPLATE_TIMESTAMP,
    updatedAt: TEMPLATE_TIMESTAMP + 1,
    nodes: [
      node('prompt', 'io', 80, 140, {
        text: '一张温暖的产品海报，干净背景，柔和自然光，主体清晰，细节精致',
      }),
      node('generate', 'aiV3', 480, 80, {
        model: '',
        mode: 'image',
        ratio: '1:1',
        resolution: 'auto',
        n: 1,
        output_format: 'png',
      }),
      node('preview', 'io', 900, 170),
    ],
    edges: [
      edge('prompt-to-generate', 'prompt', 'result', 'generate', 'input'),
      edge('generate-to-preview', 'generate', 'result', 'preview', 'input'),
    ],
    settings: {},
    metadata: { builtinTemplate: true },
  },
  {
    id: 'starter_ai_chat',
    name: 'AI 对话',
    description: '输入问题或任务说明，调用对话模型生成回复，适合先体验基础文本能力。',
    version: 1,
    createdAt: TEMPLATE_TIMESTAMP,
    updatedAt: TEMPLATE_TIMESTAMP + 2,
    nodes: [
      node('question', 'io', 80, 120, {
        text: '请用简洁的中文，帮我把这个想法整理成三个可执行步骤。',
      }),
      node('chat', 'aiV3', 480, 70, {
        model: '',
        mode: 'chat',
        enableWebSearch: false,
        temperature: 0.7,
        maxTokens: 1200,
        systemPrompt: '你是一个清晰、可靠、善于拆解任务的助手。',
      }),
      node('answer', 'io', 900, 160),
    ],
    edges: [
      edge('question-to-chat', 'question', 'result', 'chat', 'input'),
      edge('chat-to-answer', 'chat', 'result', 'answer', 'input'),
    ],
    settings: {},
    metadata: { builtinTemplate: true },
  },
  {
    id: 'starter_image_to_image',
    name: '基础图生图',
    description: '选择一张参考图，再输入改图提示词，调用图像模型生成新版本。',
    version: 1,
    createdAt: TEMPLATE_TIMESTAMP,
    updatedAt: TEMPLATE_TIMESTAMP + 3,
    nodes: [
      node('reference', 'io', 80, 60, {
        fileUrl: '',
      }),
      node('prompt', 'io', 80, 380, {
        text: '保留主体构图，把画面调整为高级商业摄影风格，光线更柔和，背景更干净',
      }),
      node('generate', 'aiV3', 500, 160, {
        model: '',
        mode: 'image',
        ratio: 'auto',
        resolution: 'auto',
        n: 1,
        output_format: 'png',
      }),
      node('preview', 'io', 940, 250),
    ],
    edges: [
      edge('reference-to-generate', 'reference', 'result', 'generate', 'input'),
      edge('prompt-to-generate', 'prompt', 'result', 'generate', 'input'),
      edge('generate-to-preview', 'generate', 'result', 'preview', 'input'),
    ],
    settings: {},
    metadata: { builtinTemplate: true },
  },
];
