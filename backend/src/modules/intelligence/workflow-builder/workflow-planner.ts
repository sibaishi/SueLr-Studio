import type { WorkflowDraftRequest } from '../intelligence.schema.ts';
import type { WorkflowDraft, WorkflowDraftStage } from './workflow-draft.schema.ts';
import type { WorkflowIntent } from './workflow-intent.schema.ts';

type PlannerKnowledgeItem = {
  id?: string;
  title?: string;
  category?: string;
  content?: string;
  source?: {
    kind?: string;
    id?: string;
    label?: string;
  };
  structured?: {
    nodeType?: string;
    nodeTypes?: string[];
    models?: unknown[];
    modelCount?: number;
    active?: boolean;
  };
  tags?: string[];
};

export type WorkflowPlannerContext = {
  items?: PlannerKnowledgeItem[];
};

function makeId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function includesAny(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword));
}

function inferPromptHelperTool(text: string): WorkflowIntent['promptHelperTool'] {
  if (includesAny(text, ['分镜图', '故事板', 'storyboard', 'storyboard sheet'])) return 'storyboard';
  if (includesAny(text, ['三视图', '参考图版式', '版式图', '正面', '侧面', '背面', '正侧背'])) return 'layout';
  if (includesAny(text, ['调整光照', '控制光照', '光照', '灯光', '布光', '打光'])) return 'lighting';
  if (includesAny(text, ['转换视角', '换视角', '视角', '机位', '摄像机', '相机', '焦距', '景别'])) return 'camera';
  return undefined;
}

function needsPromptHelper(intent: WorkflowIntent) {
  return Boolean(intent.promptHelperTool) && intent.domain !== 'chat-text';
}

function extractOutputCount(text: string) {
  const storyboardCount = includesAny(text, ['分镜图', '故事板', 'storyboard', 'storyboard sheet']);
  const arabic = text.match(/(\d+)\s*[张个份套]/);
  if (arabic) return Math.min(8, Math.max(1, Number(arabic[1]) || 1));
  const chineseMap: Record<string, number> = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8 };
  const chinese = text.match(/([一二两三四五六七八])\s*[张个份套]/);
  if (chinese) return chineseMap[chinese[1]] || 1;
  if (storyboardCount) return 6;
  return 4;
}

function inferDomain(text: string): WorkflowIntent['domain'] {
  const asksForStoryboardImage = includesAny(text, ['分镜图', '故事板', 'storyboard', 'storyboard sheet']);
  const asksForStoryboardText = includesAny(text, ['分镜脚本', '镜头脚本', '分镜文案', '镜头文案', '脚本', '剧本']);
  if (asksForStoryboardText && !asksForStoryboardImage) return 'chat-text';
  if (asksForStoryboardImage) return 'storyboard-image';
  if (includesAny(text, ['分镜文案', '逐条执行', '逐条运行', '分别输出']) && !includesAny(text, ['图片', '图', 'image', '视频', 'video'])) return 'chat-text';
  if (includesAny(text, ['文本输入后直接输出', '直出', '直接输出展示', '最小流程', '输入后直接输出'])) return 'plain-text';
  if (includesAny(text, ['合并', '三个文本', '多个文本', '汇总'])) {
    if (includesAny(text, ['输出展示', '展示', '输出', '显示'])) return 'generic-image';
  }
  if (includesAny(text, ['对话', '聊天', '问答', '客服', '摘要', '改写', '翻译', '文本生成', '文案']))
    return 'chat-text';
  if (includesAny(text, ['图生视频', '文生视频', '视频生成', '短视频', '短片', '成片', '生成视频', '输出视频']))
    return 'video-generation';
  if (includesAny(text, ['电商', '商品', '主图', '详情页', '卖点'])) return 'ecommerce-image';
  if (includesAny(text, ['品牌', '主视觉', '包装', '定位'])) return 'brand-visual';
  if (includesAny(text, ['小红书', '抖音', '社媒', '微博', 'B站'])) return 'social-image';
  return 'generic-image';
}

function buildName(request: WorkflowDraftRequest, domain: WorkflowIntent['domain']) {
  if (request.name) return request.name;
  if (domain === 'ecommerce-image') return '电商图片生成工作流草稿';
  if (domain === 'brand-visual') return '品牌视觉探索工作流草稿';
  if (domain === 'social-image') return '社媒图片批量生成工作流草稿';
  if (domain === 'chat-text') return 'AI 对话文本工作流草稿';
  if (domain === 'storyboard-image') return '分镜图生成工作流草稿';
  if (domain === 'plain-text') return '文本直出工作流草稿';
  if (domain === 'video-generation') return '视频生成工作流草稿';
  return '图片生成工作流草稿';
}

function summarizeKnowledge(context: WorkflowPlannerContext = {}) {
  const items = Array.isArray(context.items) ? context.items : [];
  const nodeCapabilityIds = new Map<string, string>();
  const savedWorkflowReferences: string[] = [];
  const promptGuidance: string[] = [];
  const modelContext: string[] = [];
  const influences: WorkflowDraft['knowledgeInfluences'] = [];

  for (const item of items) {
    const id = String(item.id || '').trim();
    if (!id) continue;
    const title = String(item.title || id).trim();
    const category = String(item.category || 'knowledge').trim();
    const sourceKind = String(item.source?.kind || 'unknown').trim();
    const nodeType = String(item.structured?.nodeType || '').trim();

    if (nodeType) {
      nodeCapabilityIds.set(nodeType, id);
      influences.push({ id, title, category, sourceKind, nodeType, effect: 'node-capability' });
      continue;
    }
    if (sourceKind === 'saved_workflow_index') {
      savedWorkflowReferences.push(id);
      influences.push({ id, title, category, sourceKind, effect: 'saved-workflow-reference' });
      continue;
    }
    if (category === 'model-knowledge') {
      modelContext.push(id);
      influences.push({ id, title, category, sourceKind, effect: 'model-context' });
      continue;
    }
    if (['user-memory', 'project-knowledge', 'brand-knowledge', 'prompt-library'].includes(category)) {
      promptGuidance.push(id);
      influences.push({ id, title, category, sourceKind, effect: 'prompt-guidance' });
    }
  }

  return {
    nodeCapabilityIds,
    savedWorkflowReferences,
    promptGuidance,
    modelContext,
    influences: influences.slice(0, 12),
  };
}

function stage(
  input: Omit<WorkflowDraftStage, 'knowledgeIds'> & { knowledgeIds?: string[] },
  knowledge: ReturnType<typeof summarizeKnowledge>,
): WorkflowDraftStage {
  const nodeType = normalizePlannerNodeType(input.nodeType);
  const nodeKnowledgeId = knowledge.nodeCapabilityIds.get(nodeType);
  return {
    ...input,
    nodeType,
    knowledgeIds: Array.from(new Set([nodeKnowledgeId, ...(input.knowledgeIds || [])].filter(Boolean) as string[])),
  };
}

function normalizePlannerNodeType(type: string) {
  if (['textInput', 'imageInput', 'videoInput', 'audioInput', 'saveFile', 'output'].includes(type)) return 'io';
  if (['aiChat', 'imageGen', 'videoGen'].includes(type)) return 'aiV3';
  return type;
}

function appendKnowledgeDescription(description: string, knowledge: ReturnType<typeof summarizeKnowledge>) {
  const parts = [];
  if (knowledge.savedWorkflowReferences.length > 0) parts.push('已参考本地历史工作流结构');
  if (knowledge.promptGuidance.length > 0) parts.push('已参考用户/项目/品牌知识');
  if (knowledge.modelContext.length > 0) parts.push('已参考本地模型配置');
  return parts.length > 0 ? `${description}\n${parts.join('；')}。` : description;
}

export function parseWorkflowIntent(request: WorkflowDraftRequest): WorkflowIntent {
  const text = request.input.trim();
  const domain = inferDomain(text);
  const requiresImageInput = domain === 'storyboard-image' ? false : includesAny(text, ['产品图', '商品图', '参考图', '图片', '图生图', '图生视频', '首帧']);
  const requiresVideoInput = includesAny(text, ['视频输入', '参考视频', '视频素材']);
  const requiresAudioInput = includesAny(text, ['音频', '配音', '旁白', '音乐']);
  const requiresTextInput = true;
  const promptHelperTool = domain === 'chat-text' ? undefined : inferPromptHelperTool(text);

  return {
    id: makeId('intent'),
    sourceText: text,
    name: buildName(request, domain),
    goal: text,
    domain,
    promptHelperTool,
    inputs: [
      ...(requiresImageInput ? [{ id: 'productImage', label: '产品图', kind: 'image' as const }] : []),
      ...(requiresVideoInput ? [{ id: 'referenceVideo', label: '参考视频', kind: 'video' as const }] : []),
      ...(requiresAudioInput ? [{ id: 'referenceAudio', label: '音频素材', kind: 'audio' as const }] : []),
      ...(requiresTextInput
        ? [
            {
              id: domain === 'chat-text' ? 'question' : 'sellingPoint',
              label: domain === 'chat-text' ? '问题或文本任务' : '卖点或创意方向',
              kind: 'text' as const,
            },
          ]
        : []),
    ],
    outputCount: domain === 'storyboard-image' ? Math.min(8, extractOutputCount(text)) : extractOutputCount(text),
    requiresImageInput,
    requiresTextInput: true,
    requiresVideoInput,
    requiresAudioInput,
  };
}

export function planWorkflowDraft(intent: WorkflowIntent, context: WorkflowPlannerContext = {}): WorkflowDraft {
  const knowledge = summarizeKnowledge(context);
  const includePromptHelper = needsPromptHelper(intent);

  if (intent.domain === 'chat-text') {
    return {
      id: makeId('draft'),
      name: intent.name,
      description: appendKnowledgeDescription(`根据需求自动生成的 AI 对话文本工作流草稿：${intent.goal}`, knowledge),
      intentId: intent.id,
      stages: [
        stage(
          {
            id: 'text_input',
            label: 'Text Input',
            nodeType: 'textInput',
            purpose: '接收问题、文本任务或待处理文本。',
          },
          knowledge,
        ),
        stage(
          {
            id: 'ai_chat',
            label: 'AI Chat',
            nodeType: 'aiChat',
            purpose: '调用对话模型生成回复、摘要、改写或文案结果。',
            knowledgeIds: knowledge.promptGuidance,
          },
          knowledge,
        ),
        stage(
          {
            id: 'save_file',
            label: 'Save File',
            nodeType: 'saveFile',
            purpose: '把文本结果落盘，供结果面板查看和复用。',
          },
          knowledge,
        ),
        stage(
          {
            id: 'output',
            label: 'Output',
            nodeType: 'output',
            purpose: '汇总最终文本输出。',
          },
          knowledge,
        ),
      ],
      approvalsRequired: ['applyDraft', 'saveWorkflow', 'executeWorkflow'],
      knowledgeInfluences: knowledge.influences,
    };
  }

  if (intent.domain === 'plain-text') {
    return {
      id: makeId('draft'),
      name: intent.name,
      description: appendKnowledgeDescription(`根据需求生成的文本直出工作流草稿：${intent.goal}`, knowledge),
      intentId: intent.id,
      stages: [
        stage(
          {
            id: 'text_input',
            label: 'Text Input',
            nodeType: 'textInput',
            purpose: '接收用户直接输入的文本内容。',
          },
          knowledge,
        ),
        stage(
          {
            id: 'output',
            label: 'Output',
            nodeType: 'output',
            purpose: '直接展示输入的文本内容。',
          },
          knowledge,
        ),
      ],
      approvalsRequired: ['applyDraft', 'saveWorkflow'],
      knowledgeInfluences: knowledge.influences,
    };
  }

  if (intent.domain === 'storyboard-image') {
    const outputCount = Math.min(8, intent.outputCount || 6);
    return {
      id: makeId('draft'),
      name: intent.name,
      description: appendKnowledgeDescription(`根据需求自动生成的分镜图工作流草稿：${intent.goal}`, knowledge),
      intentId: intent.id,
      stages: [
        stage(
          {
            id: 'script_input',
            label: 'Script Input',
            nodeType: 'textInput',
            purpose: '接收分镜脚本、文本剧本或镜头描述。',
          },
          knowledge,
        ),
        stage(
          {
            id: 'shot_planner',
            label: 'Shot Planner',
            nodeType: 'aiChat',
            purpose: `把文本脚本拆成 ${outputCount} 个连续镜头，每行一个镜头。`,
          },
          knowledge,
        ),
        stage(
          {
            id: 'shot_split',
            label: 'Shot Split',
            nodeType: 'textSplit',
            purpose: '按换行符拆分剧本为逐个镜头描述。',
          },
          knowledge,
        ),
        stage(
          {
            id: 'shot_iterate',
            label: 'Shot Iterate',
            nodeType: 'iterateRun',
            purpose: '逐项把每个镜头文本传给下游图片生成节点。',
          },
          knowledge,
        ),
        stage(
          {
            id: 'image_gen',
            label: 'Image Gen',
            nodeType: 'imageGen',
            purpose: '根据每个镜头的描述逐张生成分镜图。',
          },
          knowledge,
        ),
        stage(
          {
            id: 'save_file',
            label: 'Save File',
            nodeType: 'saveFile',
            purpose: '保存每张分镜图，供结果面板查看和下载。',
          },
          knowledge,
        ),
        stage(
          {
            id: 'output',
            label: 'Output',
            nodeType: 'output',
            purpose: '汇总全部分镜图输出。',
          },
          knowledge,
        ),
      ],
      approvalsRequired: ['applyDraft', 'saveWorkflow', 'executeWorkflow', 'highCostGeneration'],
      knowledgeInfluences: knowledge.influences,
    };
  }

  if (intent.domain === 'video-generation') {
    return {
      id: makeId('draft'),
      name: intent.name,
      description: appendKnowledgeDescription(`根据需求自动生成的视频生成工作流草稿：${intent.goal}`, knowledge),
      intentId: intent.id,
      stages: [
        ...(intent.requiresImageInput
          ? [
              stage(
                {
                  id: 'image_input',
                  label: 'Image Input',
                  nodeType: 'imageInput',
                  purpose: '接收参考图或图生视频首帧素材。',
                },
                knowledge,
              ),
            ]
          : []),
        ...(intent.requiresVideoInput
          ? [
              stage(
                {
                  id: 'video_input',
                  label: 'Video Input',
                  nodeType: 'videoInput',
                  purpose: '接收参考视频或视频素材。',
                },
                knowledge,
              ),
            ]
          : []),
        ...(intent.requiresAudioInput
          ? [
              stage(
                {
                  id: 'audio_input',
                  label: 'Audio Input',
                  nodeType: 'audioInput',
                  purpose: '接收配音、旁白或音乐素材。',
                },
                knowledge,
              ),
            ]
          : []),
        stage(
          {
            id: 'text_input',
            label: 'Text Input',
            nodeType: 'textInput',
            purpose: '接收视频主题、动作描述或提示词方向。',
          },
          knowledge,
        ),
        ...(includePromptHelper
          ? [
              stage(
                {
                  id: 'prompt_helper',
                  label: 'Prompt Helper',
                  nodeType: 'promptHelper',
                  purpose: '生成明确的视角或光照控制提示词。',
                  knowledgeIds: knowledge.promptGuidance,
                },
                knowledge,
              ),
            ]
          : []),
        stage(
          {
            id: 'video_generation',
            label: 'Video Gen',
            nodeType: 'videoGen',
            purpose: '生成视频结果。',
          },
          knowledge,
        ),
        stage(
          {
            id: 'save_file',
            label: 'Save File',
            nodeType: 'saveFile',
            purpose: '保存生成视频，供结果面板查看和下载。',
          },
          knowledge,
        ),
        stage(
          {
            id: 'output',
            label: 'Output',
            nodeType: 'output',
            purpose: '汇总最终视频输出。',
          },
          knowledge,
        ),
      ],
      approvalsRequired: ['applyDraft', 'saveWorkflow', 'executeWorkflow', 'highCostGeneration'],
      knowledgeInfluences: knowledge.influences,
    };
  }

  return {
    id: makeId('draft'),
    name: intent.name,
    description: appendKnowledgeDescription(`根据需求自动生成的工作流草稿：${intent.goal}`, knowledge),
    intentId: intent.id,
    stages: [
      ...(intent.requiresImageInput
        ? [
            stage(
              {
                id: 'image_input',
                label: 'Image Input',
                nodeType: 'imageInput',
                purpose: '接收产品图或参考图。',
              },
              knowledge,
            ),
          ]
        : []),
      stage(
        {
          id: 'text_input',
          label: 'Text Input',
          nodeType: 'textInput',
          purpose: '接收卖点、风格或创意方向。',
        },
        knowledge,
      ),
      ...(includePromptHelper
        ? [
            stage(
              {
                id: 'prompt_helper',
                label: 'Prompt Helper',
                nodeType: 'promptHelper',
                purpose:
                  intent.promptHelperTool === 'storyboard'
                    ? '生成分镜图版式提示词，供图片生成节点输出 storyboard sheet。'
                    : intent.promptHelperTool === 'layout'
                      ? '生成三视图或参考图版式提示词，供图片生成节点输出 reference sheet。'
                      : '生成明确的视角或光照控制提示词。',
                knowledgeIds: knowledge.promptGuidance,
              },
              knowledge,
            ),
          ]
        : []),
      stage(
        {
          id: 'image_generation',
          label: `Image Gen x ${intent.outputCount}`,
          nodeType: 'imageGen',
          purpose: `生成 ${intent.outputCount} 张候选图片。`,
        },
        knowledge,
      ),
      stage(
        {
          id: 'save_file',
          label: 'Save File',
          nodeType: 'saveFile',
          purpose: '保留生成结果，供结果面板和素材包使用。',
        },
        knowledge,
      ),
      stage(
        {
          id: 'output',
          label: 'Output',
          nodeType: 'output',
          purpose: '汇总最终输出。',
        },
        knowledge,
      ),
    ],
    approvalsRequired: ['applyDraft', 'saveWorkflow', 'executeWorkflow', 'highCostGeneration'],
    knowledgeInfluences: knowledge.influences,
  };
}
