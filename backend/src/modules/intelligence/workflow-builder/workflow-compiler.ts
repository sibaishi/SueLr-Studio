import type { DynamicValue, PlainObject } from '../../types.ts';
import { normalizePersistedWorkflow } from '../../workflows/workflows.schema.ts';
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

function normalizeCompiledNodeType(type: string) {
  if (['textInput', 'imageInput', 'videoInput', 'audioInput', 'saveFile', 'output'].includes(type)) return 'io';
  if (['aiChat', 'imageGen', 'videoGen'].includes(type)) return 'aiV3';
  return type;
}

function normalizeCompiledNodeData(type: string, data: PlainObject = {}) {
  const normalized: PlainObject = { ...data };
  if (type === 'textInput' && normalized.text !== undefined) {
    normalized.content = normalized.text;
    delete normalized.text;
  }
  if (['imageInput', 'videoInput', 'audioInput'].includes(type) && normalized.fileUrl !== undefined) {
    normalized.content = normalized.fileUrl;
    delete normalized.fileUrl;
  }
  if (type === 'aiChat') normalized.mode = 'chat';
  if (type === 'imageGen') normalized.mode = 'image';
  if (type === 'videoGen') normalized.mode = 'video';
  return normalized;
}

function normalizeCompiledWorkflow(workflow: PlainObject) {
  const originalTypeById = new Map<string, string>();
  const nodes = (Array.isArray(workflow.nodes) ? workflow.nodes : []).map((item) => {
    const nodeItem = item as PlainObject;
    const originalType = String(nodeItem.type || '');
    originalTypeById.set(String(nodeItem.id || ''), originalType);
    return {
      ...nodeItem,
      type: normalizeCompiledNodeType(originalType),
      data: normalizeCompiledNodeData(originalType, (nodeItem.data || {}) as PlainObject),
    };
  });

  const typeById = new Map(nodes.map((item) => [String((item as PlainObject).id || ''), String((item as PlainObject).type || '')]));
  const edges = (Array.isArray(workflow.edges) ? workflow.edges : []).map((item) => {
    const edgeItem = item as PlainObject;
    const sourceType = typeById.get(String(edgeItem.source || '')) || '';
    const targetType = typeById.get(String(edgeItem.target || '')) || '';
    const originalSourceType = originalTypeById.get(String(edgeItem.source || '')) || sourceType;
    const sourceHandle = String(edgeItem.sourceHandle || '');
    const targetHandle = String(edgeItem.targetHandle || '');
    const normalizedSourceHandle =
      sourceType === 'io' || ['aiChat', 'imageGen', 'videoGen', 'saveFile', 'output'].includes(originalSourceType)
        ? 'result'
        : sourceHandle;
    const normalizedTargetHandle = targetType === 'io' || targetType === 'aiV3' ? 'input' : targetHandle;

    return {
      ...edgeItem,
      sourceHandle: normalizedSourceHandle,
      targetHandle: normalizedTargetHandle,
    };
  });

  return {
    ...workflow,
    nodes,
    edges,
  };
}

function normalizeCurrentWorkflow(workflow: PlainObject, options: { preserveCreatedAt?: boolean; scope?: DynamicValue } = {}) {
  return normalizePersistedWorkflow(normalizeCompiledWorkflow(workflow), options);
}

function chainTextInputToAiChat(id: string, x: number, y: number, inputText: string, systemPrompt: string) {
  return [
    node(`${id}_input`, 'textInput', x, y, { text: inputText }),
    node(`${id}_chat`, 'aiChat', x + 360, y - 10, {
      model: '',
      systemPrompt,
      temperature: 0.65,
      maxTokens: 4096,
    }),
  ];
}

function summarizeGuidance(items: CompilerKnowledgeItem[] = []) {
  return items
    .filter((item) =>
      ['user-memory', 'project-knowledge', 'brand-knowledge', 'prompt-library'].includes(String(item.category || '')),
    )
    .slice(0, 4)
    .map((item) => {
      const title = String(item.title || '').trim();
      const content = String(item.content || '')
        .trim()
        .replace(/\s+/g, ' ')
        .slice(0, 180);
      return [title, content].filter(Boolean).join('：');
    })
    .filter(Boolean);
}

function buildPrompt(intent: WorkflowIntent, knowledgeItems: CompilerKnowledgeItem[] = []) {
  let basePrompt = '';
  if (intent.domain === 'chat-text') {
    basePrompt = '根据用户输入完成文本任务：回答问题、总结、改写、翻译或生成文案。要求结构清晰、直接可用。';
  } else if (intent.domain === 'storyboard-image') {
    basePrompt = '你是分镜导演。把用户脚本拆成连续镜头，每行一个镜头。每行包含画面主体、景别、动作、构图、光线、情绪，不要输出解释。';
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
  const chineseMap: Record<string, number> = {
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
    十: 10,
  };
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

function wantsComplexAssetPack(intent: WorkflowIntent) {
  return (
    includesText(intent.sourceText, ['素材包', '多条链路', '多链路']) ||
    (includesText(intent.sourceText, ['主图', '详情页']) &&
      includesText(intent.sourceText, ['文案', '分镜图', '品牌规范']))
  );
}

function wantsBatchStoryboard(intent: WorkflowIntent) {
  if (intent.domain === 'chat-text') return false;
  if (intent.domain === 'storyboard-image') return true;
  return includesText(intent.sourceText, [
    '逐项',
    '批量',
    '每个镜头',
    '每镜头',
    '8 镜头',
    '八镜头',
    '分镜图',
    '故事板',
  ]);
}

function compileComplexAssetPack(
  intent: WorkflowIntent,
  draft: WorkflowDraft,
  options: { scope?: DynamicValue; knowledgeItems?: CompilerKnowledgeItem[] } = {},
) {
  const workflowId = `draft_${draft.id}`;
  const prompt = buildPrompt(intent, options.knowledgeItems || []);
  const nodes = [
    node('product_image', 'imageInput', 80, 80, { fileUrl: '' }),
    node('brand_brief', 'textInput', 80, 260, { text: intent.goal }),
    node('brief_architect', 'aiChat', 430, 160, {
      model: '',
      temperature: 0.45,
      maxTokens: 4096,
      systemPrompt:
        '你是电商设计策略师。把输入产品图、卖点和品牌规范拆成结构化设计 brief，输出 JSON：mainVisualPrompt、detailHeroPrompt、shortVideoStoryboard、copywritingAngles。',
    }),
    node('main_image_gen', 'imageGen', 820, 40, {
      model: '',
      ratio: '1:1',
      resolution: '1k',
      n: 4,
      output_format: 'png',
    }),
    node('detail_image_gen', 'imageGen', 820, 250, {
      model: '',
      ratio: '16:9',
      resolution: '1k',
      n: 2,
      output_format: 'png',
    }),
    node('copy_writer', 'aiChat', 820, 470, {
      model: '',
      temperature: 0.7,
      maxTokens: 4096,
      systemPrompt:
        '你是电商文案。基于设计 brief 输出主标题、利益点、副标题、详情页首屏文案和短视频字幕建议，结构化列出。',
    }),
    node('storyboard_split', 'textSplit', 1180, 470, {
      separator: '\n',
      outputCount: Math.max(4, Math.min(9, extractFirstNumber(intent.sourceText) || 6)),
    }),
    node('storyboard_iterate', 'iterateRun', 1520, 470),
    node('storyboard_image_gen', 'imageGen', 1860, 430, {
      model: '',
      ratio: includesText(intent.sourceText, ['9:16', '竖版', '竖屏']) ? '9:16' : '16:9',
      resolution: '1k',
      n: 1,
      output_format: 'png',
    }),
    node('main_save', 'saveFile', 1180, 40, { filenamePrefix: 'main-visual' }),
    node('detail_save', 'saveFile', 1180, 250, { filenamePrefix: 'detail-hero' }),
    node('copy_save', 'saveFile', 1520, 250, { filenamePrefix: 'copywriting' }),
    node('storyboard_save', 'saveFile', 2200, 430, { filenamePrefix: 'storyboard-shot' }),
    node('asset_output', 'output', 2540, 250),
  ];
  const edges = [
    edge('brand-brief-to-architect', 'brand_brief', 'text', 'brief_architect', 'prompt'),
    edge('product-image-to-architect', 'product_image', 'image', 'brief_architect', 'image'),
    edge('architect-to-main-image', 'brief_architect', 'response', 'main_image_gen', 'prompt'),
    edge('product-image-to-main-image', 'product_image', 'image', 'main_image_gen', 'reference'),
    edge('architect-to-detail-image', 'brief_architect', 'response', 'detail_image_gen', 'prompt'),
    edge('product-image-to-detail-image', 'product_image', 'image', 'detail_image_gen', 'reference'),
    edge('architect-to-copy-writer', 'brief_architect', 'response', 'copy_writer', 'prompt'),
    edge('architect-to-storyboard-split', 'brief_architect', 'response', 'storyboard_split', 'text'),
    ...Array.from({ length: Math.max(4, Math.min(9, extractFirstNumber(intent.sourceText) || 6)) }, (_, index) =>
      edge(
        `storyboard-part-${index + 1}-to-iterate`,
        'storyboard_split',
        `part${index + 1}`,
        'storyboard_iterate',
        `item${index + 1}`,
      ),
    ),
    edge('iterate-to-storyboard-image', 'storyboard_iterate', 'text', 'storyboard_image_gen', 'prompt'),
    edge('main-image-to-save', 'main_image_gen', 'images', 'main_save', 'content'),
    edge('detail-image-to-save', 'detail_image_gen', 'images', 'detail_save', 'content'),
    edge('copy-to-save', 'copy_writer', 'response', 'copy_save', 'content'),
    edge('storyboard-image-to-save', 'storyboard_image_gen', 'images', 'storyboard_save', 'content'),
    edge('main-save-to-output', 'main_save', 'content', 'asset_output', 'content'),
    edge('detail-save-to-output', 'detail_save', 'content', 'asset_output', 'content2'),
    edge('copy-save-to-output', 'copy_save', 'content', 'asset_output', 'content3'),
    edge('storyboard-save-to-output', 'storyboard_save', 'content', 'asset_output', 'content4'),
  ];

  return normalizeCurrentWorkflow(
    {
      id: workflowId,
      name: draft.name,
      description: `${draft.description}\n复杂编排：多链路素材包，包含 brief 拆解、主图、详情页首屏、文案和逐项分镜图链路。\n${prompt}`,
      nodes,
      edges,
      settings: {
        workflowExecution: {
          enabled: true,
          maxConcurrency: 4,
        },
      },
      metadata: buildMetadata(intent, draft),
    },
    { preserveCreatedAt: false, scope: options.scope },
  );
}

function compileBatchStoryboard(
  intent: WorkflowIntent,
  draft: WorkflowDraft,
  options: { scope?: DynamicValue; knowledgeItems?: CompilerKnowledgeItem[] } = {},
) {
  const workflowId = `draft_${draft.id}`;
  const shotCount = Math.max(4, Math.min(9, extractFirstNumber(intent.sourceText) || 8));
  const nodes = [
    node('script_input', 'textInput', 80, 160, { text: intent.goal }),
    node('shot_planner', 'aiChat', 430, 150, {
      model: '',
      temperature: 0.55,
      maxTokens: 4096,
      systemPrompt: `你是分镜导演。把用户脚本拆成 ${shotCount} 个连续镜头，每行一个镜头。每行包含画面主体、景别、动作、构图、光线、情绪，不要输出解释。`,
    }),
    node('shot_split', 'textSplit', 800, 150, {
      separator: '\n',
      outputCount: shotCount,
    }),
    node('shot_iterate', 'iterateRun', 1140, 150),
    node('shot_image_gen', 'imageGen', 1480, 130, {
      model: '',
      ratio: includesText(intent.sourceText, ['9:16', '竖版', '竖屏']) ? '9:16' : '16:9',
      resolution: '1k',
      n: 1,
      output_format: 'png',
    }),
    node('shot_save', 'saveFile', 1840, 130, { filenamePrefix: 'storyboard-shot' }),
    node('shot_output', 'output', 2180, 170),
  ];
  const edges = [
    edge('script-to-planner', 'script_input', 'text', 'shot_planner', 'prompt'),
    edge('planner-to-split', 'shot_planner', 'response', 'shot_split', 'text'),
    ...Array.from({ length: shotCount }, (_, index) =>
      edge(`shot-part-${index + 1}-to-iterate`, 'shot_split', `part${index + 1}`, 'shot_iterate', `item${index + 1}`),
    ),
    edge('iterate-to-image-gen', 'shot_iterate', 'text', 'shot_image_gen', 'prompt'),
    edge('image-gen-to-save', 'shot_image_gen', 'images', 'shot_save', 'content'),
    edge('save-to-output', 'shot_save', 'content', 'shot_output', 'content'),
  ];

  return normalizeCurrentWorkflow(
    {
      id: workflowId,
      name: draft.name,
      description: `${draft.description}\n复杂编排：AI 拆镜头、textSplit 拆分、iterateRun 逐项生成每个镜头画面。`,
      nodes,
      edges,
      settings: {
        workflowExecution: {
          enabled: true,
          maxConcurrency: 4,
        },
      },
      metadata: buildMetadata(intent, draft),
    },
    { preserveCreatedAt: false, scope: options.scope },
  );
}

export function compileWorkflowDraft(
  intent: WorkflowIntent,
  draft: WorkflowDraft,
  options: { scope?: DynamicValue; knowledgeItems?: CompilerKnowledgeItem[] } = {},
) {
  const workflowId = `draft_${draft.id}`;
  const prompt = buildPrompt(intent, options.knowledgeItems || []);
  const includePromptHelper = hasStage(draft, 'promptHelper');

  if (wantsComplexAssetPack(intent)) {
    return compileComplexAssetPack(intent, draft, options);
  }

  if (wantsBatchStoryboard(intent)) {
    return compileBatchStoryboard(intent, draft, options);
  }

  if (intent.domain === 'plain-text') {
    const nodes = [
      node('plain_text', 'textInput', 80, 160, {
        text: intent.goal,
      }),
      node('plain_output', 'output', 460, 200),
    ];
    const edges = [edge('text-to-output', 'plain_text', 'text', 'plain_output', 'content')];
    return normalizeCurrentWorkflow(
      {
        id: `draft_${draft.id}`,
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

    return normalizeCurrentWorkflow(
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
      ...(includePromptHelper
        ? [node('prompt_helper', 'promptHelper', 460, 280, buildPromptHelperData(intent, prompt))]
        : []),
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
      ...(intent.requiresImageInput
        ? [edge('reference-image-to-video-gen', 'reference_image', 'image', 'video_gen', 'reference')]
        : []),
      ...(intent.requiresVideoInput
        ? [edge('reference-video-to-video-gen', 'reference_video', 'video', 'video_gen', 'video')]
        : []),
      ...(intent.requiresAudioInput
        ? [edge('reference-audio-to-video-gen', 'reference_audio', 'audio', 'video_gen', 'audio')]
        : []),
      edge('video-gen-to-save-file', 'video_gen', 'video', 'save_file', 'content'),
      edge('save-file-to-output', 'save_file', 'content', 'output', 'content'),
    ];

    return normalizeCurrentWorkflow(
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
    ...(includePromptHelper
      ? [node('prompt_helper', 'promptHelper', 460, 220, buildPromptHelperData(intent, prompt))]
      : []),
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
    ...(intent.requiresImageInput
      ? [edge('product-image-to-image-gen', 'product_image', 'image', 'image_gen', 'reference')]
      : []),
    edge('image-gen-to-save-file', 'image_gen', 'images', 'save_file', 'content'),
    edge('save-file-to-output', 'save_file', 'content', 'output', 'content'),
  ];

  return normalizeCurrentWorkflow(
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
