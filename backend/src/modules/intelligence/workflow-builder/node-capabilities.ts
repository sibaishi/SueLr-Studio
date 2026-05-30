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

export const WORKFLOW_NODE_CAPABILITY_SEEDS: WorkflowNodeCapability[] = [
  {
    id: 'seed_workflow_node_textInput',
    title: '文本输入节点 textInput',
    content: 'textInput 提供或透传纯文本，输出 string 类型 text，可连接到对话、提示词处理、保存或输出节点。',
    tags: ['system-seed', 'node', 'input', 'textInput', 'text'],
    structured: {
      nodeType: 'textInput',
      category: 'input',
      maturity: 'stable',
      inputs: [{ id: 'input', type: 'string', required: false }],
      outputs: [{ id: 'text', type: 'string' }],
      useWhen: ['manual-text-input', 'prompt-input', 'text-passthrough'],
    },
  },
  {
    id: 'seed_workflow_node_imageInput',
    title: '图片输入节点 imageInput',
    content: 'imageInput 提供上传或引用图片，输出 image，并可输出 mask，适合接入图片生成、图生视频、图片处理、保存或输出节点。',
    tags: ['system-seed', 'node', 'input', 'imageInput', 'image', 'mask'],
    structured: {
      nodeType: 'imageInput',
      category: 'input',
      maturity: 'stable',
      outputs: [
        { id: 'image', type: 'image' },
        { id: 'mask', type: 'mask' },
      ],
      useWhen: ['reference-image-input', 'image-to-image', 'image-to-video', 'mask-from-image-input'],
    },
  },
  {
    id: 'seed_workflow_node_videoInput',
    title: '视频输入节点 videoInput',
    content: 'videoInput 提供视频素材，输出 video，可作为视频生成、视频合并、保存或输出流程的输入。',
    tags: ['system-seed', 'node', 'input', 'videoInput', 'video'],
    structured: {
      nodeType: 'videoInput',
      category: 'input',
      maturity: 'stable',
      outputs: [{ id: 'video', type: 'video' }],
      useWhen: ['reference-video-input', 'video-material-input'],
    },
  },
  {
    id: 'seed_workflow_node_audioInput',
    title: '音频输入节点 audioInput',
    content: 'audioInput 提供音频素材，输出 audio，可用于音频合并、视频配音或保存输出。',
    tags: ['system-seed', 'node', 'input', 'audioInput', 'audio'],
    structured: {
      nodeType: 'audioInput',
      category: 'input',
      maturity: 'stable',
      outputs: [{ id: 'audio', type: 'audio' }],
      useWhen: ['audio-material-input', 'voiceover-input', 'music-input'],
    },
  },
  {
    id: 'seed_workflow_node_maskInput',
    title: '遮罩输入节点 maskInput',
    content: 'maskInput 提供遮罩素材，输出 mask，通常用于图像局部编辑或需要蒙版约束的流程。',
    tags: ['system-seed', 'node', 'input', 'maskInput', 'mask'],
    structured: {
      nodeType: 'maskInput',
      category: 'input',
      maturity: 'stable',
      outputs: [{ id: 'mask', type: 'mask' }],
      useWhen: ['image-mask-input', 'local-image-editing'],
    },
  },
  {
    id: 'seed_workflow_node_apiKeyInput',
    title: 'API Key 配置节点 apiKeyInput',
    content: 'apiKeyInput 输出 apiKey 配置，用于为下游 AI 节点覆盖模型、Base URL 和接口路径。只有需要节点级 API 配置时才使用。',
    tags: ['system-seed', 'node', 'api', 'apiKeyInput', 'apiKey'],
    structured: {
      nodeType: 'apiKeyInput',
      category: 'api',
      maturity: 'stable',
      outputs: [{ id: 'apiKey', type: 'apiKey' }],
      useWhen: ['node-level-api-config', 'override-provider-config'],
      avoidWhen: ['default-project-provider-is-enough'],
    },
  },
  {
    id: 'seed_workflow_node_aiChat',
    title: 'AI 对话节点 aiChat',
    content:
      'aiChat 调用对话/文本模型，输入 prompt 字符串，也可以接收图片上下文，输出 response 字符串。它适合客服问答、摘要、改写、翻译、文案、分镜脚本、镜头脚本、结构化文本规划等文本结果；不用于直接生成图片或视频文件。',
    tags: ['system-seed', 'node', 'ai', 'aiChat', 'chat', 'text', '客服', '问答'],
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
      useWhen: ['chat', 'customer-service-qa', 'text-generation', 'summarization', 'copywriting', 'storyboard-script', 'shot-script'],
      avoidWhen: ['direct-image-output', 'direct-video-output'],
    },
  },
  {
    id: 'seed_workflow_node_imageGen',
    title: '图片生成节点 imageGen',
    content:
      'imageGen 调用图片生成/编辑模型，输入 prompt 字符串，可选 reference 图片和 mask 遮罩，输出 images 图片数组。它适合商品图、社媒图、品牌视觉、分镜图/storyboard sheet、三视图/reference sheet、图生图和局部编辑；不用于生成视频成片。',
    tags: ['system-seed', 'node', 'ai', 'imageGen', 'image'],
    structured: {
      nodeType: 'imageGen',
      category: 'ai',
      maturity: 'stable',
      inputs: [
        { id: 'prompt', type: 'string', required: true },
        { id: 'reference', type: 'image', required: false },
        { id: 'mask', type: 'mask', required: false },
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
    tags: ['system-seed', 'node', 'ai', 'videoGen', 'video'],
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
    id: 'seed_workflow_node_promptHelper',
    title: '视觉控制提示词节点 promptHelper',
    content:
      'promptHelper 是本地参数化视觉控制提示词构造器，不调用 AI，也不是通用提示词优化器。它只把固定参数拼接成 prompt 字符串：camera 用于视角/机位/焦距，lighting 用于灯光，storyboard 用于生成分镜图/storyboard sheet 的图片提示词，layout 用于三视图/reference sheet 版式。普通文本到图片/视频生成可以直接连接 AI 生成节点；分镜脚本、镜头脚本这类文本任务应使用 aiChat。',
    tags: ['system-seed', 'node', 'tool', 'promptHelper', 'prompt', 'camera', 'lighting', 'storyboard', 'layout'],
    structured: {
      nodeType: 'promptHelper',
      category: 'tool',
      maturity: 'limited',
      inputs: [{ id: 'text', type: 'string', required: false }],
      outputs: [{ id: 'prompt', type: 'string' }],
      useWhen: ['camera-control', 'lighting-control', 'storyboard-sheet', 'reference-sheet-layout'],
      avoidWhen: ['generic-prompt-passthrough', 'simple-image-generation', 'simple-video-generation', 'storyboard-script'],
      notes: ['当前节点不调用 AI，后续能力变化时应更新此能力记录。'],
    },
  },
  {
    id: 'seed_workflow_node_textClean',
    title: '文本清理节点 textClean',
    content: 'textClean 按开始/结束关键词清理文本，输入 text，输出清理后的 text，适合去除思考区间、包装标签或模型输出中的固定片段。',
    tags: ['system-seed', 'node', 'tool', 'textClean', 'text'],
    structured: {
      nodeType: 'textClean',
      category: 'tool',
      maturity: 'stable',
      inputs: [{ id: 'text', type: 'string', required: true }],
      outputs: [{ id: 'text', type: 'string' }],
      params: ['startToken', 'endToken', 'removeStartToken', 'removeEndToken', 'removeAllRanges'],
      useWhen: ['clean-model-output', 'remove-delimited-text'],
    },
  },
  {
    id: 'seed_workflow_node_textSplit',
    title: '文本拆分节点 textSplit',
    content: 'textSplit 按分隔符把文本拆成多个片段输出，适合把脚本、清单或多段提示词拆给后续逐项处理节点。',
    tags: ['system-seed', 'node', 'tool', 'textSplit', 'text'],
    structured: {
      nodeType: 'textSplit',
      category: 'tool',
      maturity: 'stable',
      inputs: [{ id: 'text', type: 'string', required: true }],
      outputs: [{ id: 'part1', type: 'string' }],
      params: ['separator', 'outputCount'],
      useWhen: ['split-script', 'split-list', 'multi-step-text-routing'],
    },
  },
  {
    id: 'seed_workflow_node_textMerge',
    title: '文本合并节点 textMerge',
    content: 'textMerge 合并多个文本输入，输出 string[] 类型 merged，适合把多路文本结果汇总后保存或继续处理。',
    tags: ['system-seed', 'node', 'merge', 'textMerge', 'text'],
    structured: {
      nodeType: 'textMerge',
      category: 'merge',
      maturity: 'stable',
      inputs: [{ id: 'item', type: 'string', required: false, multiple: true }],
      outputs: [{ id: 'merged', type: 'string[]' }],
      useWhen: ['merge-text-results', 'collect-text-items'],
    },
  },
  {
    id: 'seed_workflow_node_imageMerge',
    title: '图片合并节点 imageMerge',
    content: 'imageMerge 合并多个图片输入，输出 image[] 类型 merged，适合把多路图片结果汇总给保存、输出或逐项处理。',
    tags: ['system-seed', 'node', 'merge', 'imageMerge', 'image'],
    structured: {
      nodeType: 'imageMerge',
      category: 'merge',
      maturity: 'stable',
      inputs: [{ id: 'item', type: 'image', required: false, multiple: true }],
      outputs: [{ id: 'merged', type: 'image[]' }],
      useWhen: ['merge-image-results', 'collect-image-items'],
    },
  },
  {
    id: 'seed_workflow_node_videoMerge',
    title: '视频合并节点 videoMerge',
    content: 'videoMerge 合并多个视频输入，输出 video[] 类型 merged，适合把多路视频结果汇总给保存、输出或逐项处理。',
    tags: ['system-seed', 'node', 'merge', 'videoMerge', 'video'],
    structured: {
      nodeType: 'videoMerge',
      category: 'merge',
      maturity: 'stable',
      inputs: [{ id: 'item', type: 'video', required: false, multiple: true }],
      outputs: [{ id: 'merged', type: 'video[]' }],
      useWhen: ['merge-video-results', 'collect-video-items'],
    },
  },
  {
    id: 'seed_workflow_node_audioMerge',
    title: '音频合并节点 audioMerge',
    content: 'audioMerge 合并多个音频输入，输出 audio[] 类型 merged，适合把多路音频结果汇总给保存、输出或逐项处理。',
    tags: ['system-seed', 'node', 'merge', 'audioMerge', 'audio'],
    structured: {
      nodeType: 'audioMerge',
      category: 'merge',
      maturity: 'stable',
      inputs: [{ id: 'item', type: 'audio', required: false, multiple: true }],
      outputs: [{ id: 'merged', type: 'audio[]' }],
      useWhen: ['merge-audio-results', 'collect-audio-items'],
    },
  },
  {
    id: 'seed_workflow_node_imageResize',
    title: '图像缩放节点 imageResize',
    content: 'imageResize 对输入 image 做尺寸或百分比缩放，输出缩放后的 image，适合在生成后统一尺寸或为下游节点准备指定规格图片。',
    tags: ['system-seed', 'node', 'tool', 'imageResize', 'image'],
    structured: {
      nodeType: 'imageResize',
      category: 'tool',
      maturity: 'stable',
      inputs: [{ id: 'image', type: 'image', required: true }],
      outputs: [{ id: 'image', type: 'image' }],
      params: ['resizeMode', 'scalePercent', 'targetWidth', 'targetHeight'],
      useWhen: ['resize-image', 'prepare-image-dimensions'],
    },
  },
  {
    id: 'seed_workflow_node_imageCompare',
    title: '图片对比节点 imageCompare',
    content: 'imageCompare 接收两张图片用于对比检查，当前不产生下游输出，适合人工或诊断环节，不适合作为生成链路中的转换节点。',
    tags: ['system-seed', 'node', 'tool', 'imageCompare', 'image'],
    structured: {
      nodeType: 'imageCompare',
      category: 'tool',
      maturity: 'limited',
      inputs: [
        { id: 'image1', type: 'image', required: true },
        { id: 'image2', type: 'image', required: true },
      ],
      outputs: [],
      useWhen: ['visual-comparison', 'review-step'],
      avoidWhen: ['needs-downstream-generated-value'],
    },
  },
  {
    id: 'seed_workflow_node_iterateRun',
    title: '文本逐项节点 iterateRun',
    content: 'iterateRun 从多个文本输入中取当前逐项文本并输出 text，当前执行器偏轻量透传，适合简单逐项流程占位。',
    tags: ['system-seed', 'node', 'iterate', 'iterateRun', 'text'],
    structured: {
      nodeType: 'iterateRun',
      category: 'iterate',
      maturity: 'limited',
      inputs: [{ id: 'item', type: 'string', required: false, multiple: true }],
      outputs: [{ id: 'text', type: 'string' }],
      useWhen: ['iterate-text-items'],
      notes: ['当前不是完整循环调度器，复杂批处理需要后续 planner/执行器增强。'],
    },
  },
  {
    id: 'seed_workflow_node_iterateImageRun',
    title: '图像逐项节点 iterateImageRun',
    content: 'iterateImageRun 从多个图片输入中取当前逐项图片并输出 image，当前执行器偏轻量透传，适合简单逐项图片流程占位。',
    tags: ['system-seed', 'node', 'iterate', 'iterateImageRun', 'image'],
    structured: {
      nodeType: 'iterateImageRun',
      category: 'iterate',
      maturity: 'limited',
      inputs: [{ id: 'item', type: 'image', required: false, multiple: true }],
      outputs: [{ id: 'image', type: 'image' }],
      useWhen: ['iterate-image-items'],
      notes: ['当前不是完整循环调度器，复杂批处理需要后续 planner/执行器增强。'],
    },
  },
  {
    id: 'seed_workflow_node_saveFile',
    title: '保存文件节点 saveFile',
    content: 'saveFile 用于把上游内容按配置落盘为运行时结果文件，并透传原 content；如果未设置 outputPath，执行器会跳过显式保存。',
    tags: ['system-seed', 'node', 'output', 'saveFile', 'artifact'],
    structured: {
      nodeType: 'saveFile',
      category: 'output',
      maturity: 'stable',
      inputs: [{ id: 'content', type: 'any', required: true }],
      outputs: [{ id: 'content', type: 'any' }],
      params: ['outputPath', 'filenamePrefix'],
      useWhen: ['save-runtime-result', 'preserve-output-artifact'],
    },
  },
  {
    id: 'seed_workflow_node_output',
    title: '结果输出节点 output',
    content: 'output 是工作流最终结果节点。连接到 output 的内容会作为用户可查看的最终结果返回，并会自动整理可展示结果文件。',
    tags: ['system-seed', 'node', 'output', 'result'],
    structured: {
      nodeType: 'output',
      category: 'output',
      maturity: 'stable',
      inputs: [{ id: 'content', type: 'any', required: true }],
      outputs: [],
      useWhen: ['final-user-visible-result'],
    },
  },
];
