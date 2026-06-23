import { getWorkflowArchitectNodeTypes } from '../../../../../src/shared/workflow/node-catalog.js';
import { getNodeDef } from '../../../../../src/shared/workflow/node-registry.js';

export type WorkflowNodeCapability = {
  id: string;
  title: string;
  content: string;
  tags: string[];
  structured: {
    nodeType: string;
    category: string;
    maturity: 'stable' | 'limited' | 'experimental';
    inputs?: Array<{ id: string; type: string; required?: boolean; multiple?: boolean }>;
    outputs: Array<{ id: string; type: string }>;
    params?: string[];
    useWhen?: string[];
    avoidWhen?: string[];
    notes?: string[];
  };
};

const MANUAL_WORKFLOW_NODE_CAPABILITY_SEEDS: WorkflowNodeCapability[] = [
  {
    id: 'seed_workflow_node_io',
    title: 'IO 通用输入输出节点 io',
    content:
      'io 是通用输入输出节点，取代旧的 textInput/imageInput/videoInput/audioInput/maskInput/apiKeyInput。支持上传文件、录入文本、拖放素材，输出统一的结构化 content。可接收上游节点数据自动合并。',
    tags: ['system-seed', 'node', 'input', 'io', 'text', 'image', 'video', 'audio'],
    structured: {
      nodeType: 'io',
      category: 'input',
      maturity: 'stable',
      inputs: [{ id: 'input', type: 'any', required: false, multiple: true }],
      outputs: [{ id: 'output', type: 'any' }],
      useWhen: ['any-input-source', 'text-input', 'image-input', 'video-input', 'audio-input', 'passthrough'],
    },
  },
  {
    id: 'seed_workflow_node_aiChat',
    title: 'AI 对话节点 aiChat',
    content:
      'aiChat 调用对话/文本模型，输入 prompt 字符串，也可以接收图片上下文，输出 response 字符串。它适合客服问答、摘要、改写、翻译、文案、分镜脚本/镜头脚本/剧本生成、结构化文本规划等文本结果；不用于直接生成图片或视频文件。',
    tags: [
      'system-seed',
      'node',
      'ai',
      'aiChat',
      'chat',
      'text',
      '客服',
      '问答',
      '对话',
      '文案',
      '分镜脚本',
      '镜头脚本',
      '剧本',
      '文本生成',
    ],
    structured: {
      nodeType: 'aiChat',
      category: 'ai',
      maturity: 'stable',
      inputs: [
        { id: 'prompt', type: 'string', required: true },
        { id: 'image', type: 'image', required: false },
        { id: 'apiKey', type: 'apiKey', required: false },
      ],
      outputs: [{ id: 'response', type: 'string' }],
      params: ['model', 'enableWebSearch', 'temperature', 'maxTokens', 'systemPrompt'],
      useWhen: [
        'chat',
        'customer-service-qa',
        'text-generation',
        'summarization',
        'copywriting',
        'storyboard-script',
        'shot-script',
      ],
      avoidWhen: ['direct-image-output', 'direct-video-output'],
    },
  },
  {
    id: 'seed_workflow_node_imageGen',
    title: '图片生成节点 imageGen',
    content:
      'imageGen 调用图片生成/编辑模型，输入 prompt 字符串，可选 reference 图片，输出 images 图片数组。它适合商品图、社媒图、品牌视觉、分镜图/storyboard sheet、三视图/reference sheet、图生图和局部编辑；不用于生成视频成片。',
    tags: ['system-seed', 'node', 'ai', 'imageGen', 'image'],
    structured: {
      nodeType: 'imageGen',
      category: 'ai',
      maturity: 'stable',
      inputs: [
        { id: 'prompt', type: 'string', required: true },
        { id: 'reference', type: 'image', required: false },
        { id: 'apiKey', type: 'apiKey', required: false },
      ],
      outputs: [{ id: 'images', type: 'image[]' }],
      params: ['model', 'ratio', 'resolution', 'n', 'width', 'height', 'output_format'],
      useWhen: ['image-generation', 'image-editing', 'storyboard-sheet', 'reference-sheet', 'ecommerce-image'],
      avoidWhen: ['video-file-output', 'pure-text-output'],
    },
  },
  {
    id: 'seed_workflow_node_videoGen',
    title: '视频生成节点 videoGen',
    content:
      'videoGen 调用视频生成模型，输入 prompt 字符串，可选 reference 图片、video 视频和 audio 音频，输出 video 文件。只有最终结果需要实际视频/短片/图生视频/文生视频时才使用；生成分镜图、故事板图片、分镜脚本或镜头文案不应该使用 videoGen。',
    tags: ['system-seed', 'node', 'ai', 'videoGen', 'video', '视频', '视频生成', '短片', '成片', '短视频'],
    structured: {
      nodeType: 'videoGen',
      category: 'ai',
      maturity: 'stable',
      inputs: [
        { id: 'prompt', type: 'string', required: true },
        { id: 'reference', type: 'image', required: false },
        { id: 'video', type: 'video', required: false },
        { id: 'audio', type: 'audio', required: false },
        { id: 'apiKey', type: 'apiKey', required: false },
      ],
      outputs: [{ id: 'video', type: 'video' }],
      params: ['model', 'duration', 'resolution', 'ratio'],
      useWhen: ['video-generation', 'image-to-video', 'text-to-video', 'short-video-output'],
      avoidWhen: ['storyboard-sheet', 'storyboard-script', 'image-output', 'text-output'],
    },
  },
  {
    id: 'seed_workflow_node_aiV3',
    title: 'Midjourney 生图（AiV3 midjourney 模式）',
    content:
      'AiV3 的 midjourney 模式通过 Midjourney 异步任务接口生成图片。选择 midjourney 类型的项目模型后，节点自动切为该模式，提交异步任务并轮询结果，生成的四宫格和放大图以本地路径形式透传给下游 IO。',
    tags: ['system-seed', 'node', 'ai', 'aiV3', 'midjourney', 'image', 'async-task'],
    structured: {
      nodeType: 'aiV3',
      category: 'ai',
      maturity: 'experimental',
      inputs: [{ id: 'input', type: 'any', required: false }],
      outputs: [{ id: 'result', type: 'any' }],
      params: ['model', 'mode', 'mjMode'],
      useWhen: ['midjourney-image-generation', 'midjourney-style', 'async-image-task'],
      avoidWhen: ['video-output', 'pure-text-output'],
      notes: ['首版仅支持 Imagine；task 输出保留 jobId 和 components，供后续 Action 节点使用。'],
    },
  },
  {
    id: 'seed_workflow_node_promptHelper',
    title: '视觉控制提示词节点 promptHelper',
    content:
      'promptHelper 是本地参数化视觉控制提示词构造器，不调用 AI，也不是通用提示词优化器。它只把固定参数拼接成 prompt 字符串：camera 可用于调整现有图片视角，或为新图片生成指定视角/机位/焦距；lighting 用于灯光；storyboard 用于生成分镜图/storyboard sheet 的图片提示词；layout 用于三视图/reference sheet 版式。普通文本到图片/视频生成可以直接连接 AI 生成节点；分镜脚本、镜头脚本这类文本任务应使用 aiChat。',
    tags: ['system-seed', 'node', 'tool', 'promptHelper', 'prompt', 'camera', 'lighting', 'storyboard', 'layout'],
    structured: {
      nodeType: 'promptHelper',
      category: 'tool',
      maturity: 'limited',
      inputs: [{ id: 'text', type: 'string', required: false }],
      outputs: [{ id: 'prompt', type: 'string' }],
      useWhen: [
        'camera-control',
        'lighting-control',
        'storyboard-sheet',
        'reference-sheet-layout',
        'storyboard-layout-control',
      ],
      avoidWhen: [
        'generic-prompt-passthrough',
        'simple-image-generation',
        'simple-video-generation',
        'storyboard-script',
        'generic-text-to-image',
      ],
      notes: ['当前节点不调用 AI，后续能力变化时应更新此能力记录。promptHelper 只拼接固定参数，不是通用提示词优化器。'],
    },
  },
  {
    id: 'seed_workflow_node_materialProcess',
    title: '素材处理节点 materialProcess',
    content:
      'materialProcess 统一处理文本和图像素材。它使用 input/result 通用端口，可自动识别素材类型或手动指定；支持仅拆分、仅逐项、拆分后逐项。文本按 separator 拆分且最多输出 outputCount 项，图像按 rows×columns 网格拆分。启用逐项时，执行器会为每个结果分别运行下游链路；同一条有向路径只允许一个逐项素材处理节点。',
    tags: ['system-seed', 'node', 'tool', 'materialProcess', '素材处理', '文本拆分', '图像拆分', '逐项', '批量'],
    structured: {
      nodeType: 'materialProcess',
      category: 'tool',
      maturity: 'stable',
      inputs: [{ id: 'input', type: 'any', required: true }],
      outputs: [{ id: 'result', type: 'any' }],
      params: ['materialType', 'splitEnabled', 'iterateEnabled', 'separator', 'outputCount', 'rows', 'columns'],
      useWhen: [
        'split-script',
        'split-grid-image',
        'batch-text-processing',
        'batch-image-processing',
        'storyboard-shot-iteration',
      ],
      avoidWhen: ['semantic-segmentation', 'background-removal', 'freeform-crop', 'save-file'],
      notes: [
        '启用逐项时由 workflow executor 调度下游，不是普通单次透传。',
        '同一条有向路径只允许一个启用逐项的 materialProcess；独立并行分支可分别使用。',
      ],
    },
  },
];

function deriveCapabilityContract(seed: WorkflowNodeCapability): WorkflowNodeCapability {
  const node = getNodeDef(seed.structured.nodeType);
  if (!node) return seed;
  return {
    ...seed,
    structured: {
      ...seed.structured,
      category: node.category,
      ...(node.inputs.length > 0
        ? {
            inputs: node.inputs.map((port: { id: string; type: string; required?: boolean; multiple?: boolean }) => ({
              id: port.id,
              type: port.type,
              ...(port.required !== undefined ? { required: port.required } : {}),
              ...(port.multiple !== undefined ? { multiple: port.multiple } : {}),
            })),
          }
        : { inputs: undefined }),
      outputs: node.outputs.map((port: { id: string; type: string }) => ({ id: port.id, type: port.type })),
    },
  };
}

function createDefaultCapabilitySeed(nodeType: string): WorkflowNodeCapability | null {
  const node = getNodeDef(nodeType);
  if (!node) return null;
  return deriveCapabilityContract({
    id: `seed_workflow_node_${nodeType}`,
    title: `${node.label || nodeType} ${nodeType}`,
    content: `${node.label || nodeType} 是当前工作流节点目录中的 ${node.category} 节点。`,
    tags: ['system-seed', 'node', node.category, nodeType],
    structured: {
      nodeType,
      category: node.category,
      maturity: 'stable',
      outputs: [],
      params: node.params.map((param: { id: string }) => param.id),
    },
  });
}

const architectNodeTypes = getWorkflowArchitectNodeTypes();
const manualSeedsByType = new Map(
  MANUAL_WORKFLOW_NODE_CAPABILITY_SEEDS.filter((seed) => architectNodeTypes.includes(seed.structured.nodeType)).map(
    (seed) => [seed.structured.nodeType, deriveCapabilityContract(seed)],
  ),
);

export const WORKFLOW_NODE_CAPABILITY_SEEDS = architectNodeTypes
  .map((nodeType) => manualSeedsByType.get(nodeType) || createDefaultCapabilitySeed(nodeType))
  .filter((seed): seed is WorkflowNodeCapability => Boolean(seed));
