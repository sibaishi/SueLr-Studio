import { normalizePersistedWorkflow } from '../../workflows/workflows.schema.ts';
import type { DynamicValue, PlainObject } from '../../types.ts';
import type { WorkflowDraft } from './workflow-draft.schema.ts';
import type { WorkflowIntent } from './workflow-intent.schema.ts';

type CompilerKnowledgeItem = {
  id?: string;
  title?: string;
  category?: string;
  content?: string;
  source?: {
    kind?: string;
    id?: string;
    label?: string;
  };
};

function node(id: string, type: string, x: number, y: number, data: PlainObject = {}) {
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

function summarizeGuidance(items: CompilerKnowledgeItem[] = []) {
  return items
    .filter((item) => ['user-memory', 'project-knowledge', 'brand-knowledge', 'prompt-library'].includes(String(item.category || '')))
    .slice(0, 4)
    .map((item) => {
      const title = String(item.title || '').trim();
      const content = String(item.content || '').trim().replace(/\s+/g, ' ').slice(0, 180);
      return [title, content].filter(Boolean).join('：');
    })
    .filter(Boolean);
}

function buildPrompt(intent: WorkflowIntent, knowledgeItems: CompilerKnowledgeItem[] = []) {
  let basePrompt = '';
  if (intent.domain === 'chat-text') {
    basePrompt = '根据用户输入完成文本任务：回答问题、总结、改写、翻译或生成文案。要求结构清晰、直接可用。';
  } else if (intent.domain === 'video-generation') {
    basePrompt = '根据用户的视频需求生成适合视频模型的提示词：主体清晰、镜头运动明确、节奏稳定、画面连续。';
  } else if (intent.domain === 'ecommerce-image') {
    basePrompt = '围绕输入产品图和卖点，生成高级电商主图提示词：主体清晰、背景干净、卖点突出、商业摄影质感。';
  } else if (intent.domain === 'brand-visual') {
    basePrompt = '根据品牌方向生成主视觉探索提示词：风格统一、视觉记忆点明确、适合系列化延展。';
  } else if (intent.domain === 'social-image') {
    basePrompt = '根据内容主题生成社媒首发图片提示词：封面感强、信息清晰、适合移动端浏览。';
  } else {
    basePrompt = '根据需求生成图片提示词：主体明确、构图清晰、输出可用于设计评审。';
  }

  const guidance = summarizeGuidance(knowledgeItems);
  if (guidance.length === 0) return basePrompt;
  return `${basePrompt}\n\n参考本地知识，但不要绕过用户确认：\n${guidance.map((item) => `- ${item}`).join('\n')}`;
}

function extractFirstNumber(text: string) {
  const arabic = text.match(/(\d+)/);
  if (arabic) return Number(arabic[1]);
  const chineseMap: Record<string, number> = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
  const chinese = text.match(/[一二两三四五六七八九十]/);
  return chinese ? chineseMap[chinese[0]] : undefined;
}

function includesText(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword));
}

function buildPromptHelperData(intent: WorkflowIntent, prompt: string): PlainObject {
  if (intent.promptHelperTool === 'storyboard') {
    const shotCount = Math.max(1, Math.min(12, extractFirstNumber(intent.sourceText) || 6));
    return {
      activeTool: 'storyboard',
      baseText: prompt,
      storyboardConfig: {
        layoutPreset: 'custom',
        aspectRatio: includesText(intent.sourceText, ['9:16', '竖版', '竖屏']) ? '9:16' : '16:9',
        shotCount,
        includeShotNumbers: true,
        noText: true,
        continuity: true,
      },
    };
  }
  if (intent.promptHelperTool === 'layout') {
    return {
      activeTool: 'layout',
      baseText: prompt,
      layoutConfig: {
        consistency: true,
        blocks: [
          { id: 'front', kind: 'front', label: '正面', x: 4, y: 16, w: 28, h: 68 },
          { id: 'side', kind: 'side', label: '侧面', x: 36, y: 16, w: 28, h: 68 },
          { id: 'back', kind: 'back', label: '背面', x: 68, y: 16, w: 28, h: 68 },
        ],
      },
    };
  }
  if (intent.promptHelperTool === 'lighting') {
    return { activeTool: 'lighting', baseText: prompt };
  }
  return { activeTool: 'camera', baseText: prompt };
}

function buildMetadata(intent: WorkflowIntent, draft: WorkflowDraft) {
  return {
    source: 'intelligence.workflowDraft',
    intentId: intent.id,
    intentDomain: intent.domain,
    draftId: draft.id,
    approvalsRequired: draft.approvalsRequired,
    knowledgeInfluences: draft.knowledgeInfluences,
    stageKnowledge: draft.stages
      .filter((stage) => stage.knowledgeIds.length > 0)
      .map((stage) => ({
        stageId: stage.id,
        nodeType: stage.nodeType,
        knowledgeIds: stage.knowledgeIds,
      })),
  };
}

function hasStage(draft: WorkflowDraft, nodeType: string) {
  return draft.stages.some((stage) => stage.nodeType === nodeType);
}

export function compileWorkflowDraft(
  intent: WorkflowIntent,
  draft: WorkflowDraft,
  options: { scope?: DynamicValue; knowledgeItems?: CompilerKnowledgeItem[] } = {},
) {
  const workflowId = `draft_${draft.id}`;
  const prompt = buildPrompt(intent, options.knowledgeItems || []);
  const includePromptHelper = hasStage(draft, 'promptHelper');

  if (intent.domain === 'chat-text') {
    const nodes = [
      node('question', 'textInput', 80, 160, {
        text: intent.goal,
      }),
      node('ai_chat', 'aiChat', 460, 150, {
        model: '',
        systemPrompt: prompt,
        temperature: 0.7,
        maxTokens: 4096,
      }),
      node('save_file', 'saveFile', 840, 150, {
        outputPath: '',
      }),
      node('output', 'output', 1180, 190),
    ];

    const edges = [
      edge('question-to-ai-chat', 'question', 'text', 'ai_chat', 'prompt'),
      edge('ai-chat-to-save-file', 'ai_chat', 'response', 'save_file', 'content'),
      edge('save-file-to-output', 'save_file', 'content', 'output', 'content'),
    ];

    return normalizePersistedWorkflow(
      {
        id: workflowId,
        name: draft.name,
        description: draft.description,
        nodes,
        edges,
        settings: {},
        metadata: buildMetadata(intent, draft),
      },
      { preserveCreatedAt: false, scope: options.scope },
    );
  }

  if (intent.domain === 'video-generation') {
    const mediaNodes = [
      ...(intent.requiresImageInput ? [node('reference_image', 'imageInput', 80, 80, { fileUrl: '' })] : []),
      ...(intent.requiresVideoInput ? [node('reference_video', 'videoInput', 80, 250, { fileUrl: '' })] : []),
      ...(intent.requiresAudioInput ? [node('reference_audio', 'audioInput', 80, 420, { fileUrl: '' })] : []),
    ];
    const nodes = [
      ...mediaNodes,
      node('video_prompt', 'textInput', 80, mediaNodes.length > 0 ? 600 : 220, {
        text: intent.goal,
      }),
      ...(includePromptHelper ? [node('prompt_helper', 'promptHelper', 460, 280, buildPromptHelperData(intent, prompt))] : []),
      node('video_gen', 'videoGen', includePromptHelper ? 820 : 520, 250, {
        model: '',
        duration: 5,
        resolution: '720p',
        ratio: 'auto',
      }),
      node('save_file', 'saveFile', includePromptHelper ? 1180 : 880, 250, {
        outputPath: '',
      }),
      node('output', 'output', includePromptHelper ? 1500 : 1200, 290),
    ];

    const edges = [
      ...(includePromptHelper
        ? [
            edge('video-prompt-to-prompt-helper', 'video_prompt', 'text', 'prompt_helper', 'text'),
            edge('prompt-helper-to-video-gen', 'prompt_helper', 'prompt', 'video_gen', 'prompt'),
          ]
        : [edge('video-prompt-to-video-gen', 'video_prompt', 'text', 'video_gen', 'prompt')]),
      ...(intent.requiresImageInput ? [edge('reference-image-to-video-gen', 'reference_image', 'image', 'video_gen', 'reference')] : []),
      ...(intent.requiresVideoInput ? [edge('reference-video-to-video-gen', 'reference_video', 'video', 'video_gen', 'video')] : []),
      ...(intent.requiresAudioInput ? [edge('reference-audio-to-video-gen', 'reference_audio', 'audio', 'video_gen', 'audio')] : []),
      edge('video-gen-to-save-file', 'video_gen', 'video', 'save_file', 'content'),
      edge('save-file-to-output', 'save_file', 'content', 'output', 'content'),
    ];

    return normalizePersistedWorkflow(
      {
        id: workflowId,
        name: draft.name,
        description: draft.description,
        nodes,
        edges,
        settings: {},
        metadata: buildMetadata(intent, draft),
      },
      { preserveCreatedAt: false, scope: options.scope },
    );
  }

  const nodes = [
    ...(intent.requiresImageInput ? [node('product_image', 'imageInput', 80, 80, { fileUrl: '' })] : []),
    node('selling_point', 'textInput', 80, intent.requiresImageInput ? 360 : 160, {
      text: intent.goal,
    }),
    ...(includePromptHelper ? [node('prompt_helper', 'promptHelper', 460, 220, buildPromptHelperData(intent, prompt))] : []),
    node('image_gen', 'imageGen', includePromptHelper ? 820 : 520, 180, {
      model: '',
      ratio: intent.domain === 'ecommerce-image' ? '1:1' : 'auto',
      resolution: 'auto',
      n: intent.outputCount,
      output_format: 'png',
    }),
    node('save_file', 'saveFile', includePromptHelper ? 1180 : 880, 180, {
      outputPath: '',
    }),
    node('output', 'output', includePromptHelper ? 1500 : 1200, 220),
  ];

  const edges = [
    ...(includePromptHelper
      ? [
          edge('selling-point-to-prompt-helper', 'selling_point', 'text', 'prompt_helper', 'text'),
          edge('prompt-helper-to-image-gen', 'prompt_helper', 'prompt', 'image_gen', 'prompt'),
        ]
      : [edge('selling-point-to-image-gen', 'selling_point', 'text', 'image_gen', 'prompt')]),
    ...(intent.requiresImageInput ? [edge('product-image-to-image-gen', 'product_image', 'image', 'image_gen', 'reference')] : []),
    edge('image-gen-to-save-file', 'image_gen', 'images', 'save_file', 'content'),
    edge('save-file-to-output', 'save_file', 'content', 'output', 'content'),
  ];

  return normalizePersistedWorkflow(
    {
      id: workflowId,
      name: draft.name,
      description: draft.description,
      nodes,
      edges,
      settings: {},
      metadata: buildMetadata(intent, draft),
    },
    { preserveCreatedAt: false, scope: options.scope },
  );
}
