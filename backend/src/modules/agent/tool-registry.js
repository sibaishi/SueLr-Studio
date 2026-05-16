import { fileToBase64 } from '../../engine/helpers/fileHelper.js';

function cleanString(value, maxLength = 5000) {
  if (value === undefined || value === null) return '';
  return String(value).trim().slice(0, maxLength);
}

const TOOL_NAME_ALIASES = {
  'web.search': 'web_search',
  'memory.search': 'search_memory',
  'memory.write': 'memory_write',
  'image.generate': 'generate_image',
  generate_video: 'video_generate',
  'video.generate': 'video_generate',
  'conversation.summarize': 'conversation_summarize',
  'workflow.execute': 'workflow_execute',
};

function normalizeToolName(name) {
  const clean = cleanString(name, 80);
  return TOOL_NAME_ALIASES[clean] || clean;
}

function jsonOrText(value) {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function schemaObject(properties, required = []) {
  return {
    type: 'object',
    properties,
    required,
    additionalProperties: false,
  };
}

function normalizeImageToolResult(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return data;
  if (Array.isArray(data.artifacts)) return data;
  const images = Array.isArray(data.images) ? data.images.filter((item) => typeof item === 'string' && item) : [];
  if (images.length === 0) return data;
  const { rawData: _rawData, rawImages: _rawImages, ...safeData } = data;
  return {
    type: 'image_generation_result',
    tool: 'generate_image',
    ...safeData,
    artifacts: images.map((url, index) => ({
      type: 'image',
      url,
      name: `generated-image-${index + 1}`,
    })),
  };
}

function normalizeVideoToolResult(data, request = {}) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return data;
  if (Array.isArray(data.artifacts)) return data;
  const videos = []
    .concat(data.video || [])
    .concat(data.videos || [])
    .concat(data.videoUrl || [])
    .filter((item) => typeof item === 'string' && item);
  const taskId = cleanString(data.taskId || data.id, 200);
  return {
    type: 'video_generation_result',
    tool: 'video_generate',
    status: videos.length > 0 ? 'completed' : (taskId ? 'submitted' : 'unknown'),
    taskId: taskId || undefined,
    videos,
    request,
    artifacts: videos.map((url, index) => ({
      type: 'video',
      url,
      name: `generated-video-${index + 1}`,
    })),
    raw: data.raw,
  };
}

function normalizePositiveInteger(value, fallback, min = 1, max = 20) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

function normalizeVideoDuration(value, fallback = -1) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const duration = Math.floor(parsed);
  if (duration === -1) return -1;
  return Math.min(15, Math.max(4, duration));
}

function normalizeImageQuality(value) {
  const normalized = cleanString(value, 40).toLowerCase();
  if (!normalized) return '';
  const aliases = {
    low: 'low',
    medium: 'medium',
    high: 'high',
    auto: 'auto',
    standard: 'medium',
    normal: 'medium',
    default: 'auto',
    hd: 'high',
    hq: 'high',
    best: 'high',
  };
  return aliases[normalized] || '';
}

function normalizeImageRatio(value) {
  const normalized = cleanString(value, 40).replace('：', ':').toLowerCase();
  const allowed = new Set(['auto', '1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3']);
  return allowed.has(normalized) ? normalized : '';
}

function normalizeImageOutputFormat(value) {
  const normalized = cleanString(value, 40).toLowerCase();
  if (normalized === 'jpg') return 'jpeg';
  const allowed = new Set(['png', 'jpeg', 'webp']);
  return allowed.has(normalized) ? normalized : '';
}

function normalizeImageResolution(value) {
  const normalized = cleanString(value, 40).toLowerCase();
  const allowed = new Set(['auto', '512px', '1k', '2k', '4k']);
  return allowed.has(normalized) ? normalized : '';
}

function normalizeVideoRatio(value) {
  return normalizeImageRatio(value);
}

function normalizeVideoResolution(value) {
  const normalized = cleanString(value, 40).toLowerCase();
  const allowed = new Set(['480p', '720p', '1080p', '2k', '4k']);
  return allowed.has(normalized) ? normalized : '';
}

function isLocalOrInlineImageRef(value) {
  const str = String(value || '').trim();
  return str.startsWith('data:')
    || str.startsWith('/api/files/')
    || str.startsWith('/api/outputs/')
    || str.startsWith('/api/assistant/files/');
}

function resolveImageRefsForToolArgs(args, ctx) {
  const argImages = Array.isArray(args.image)
    ? args.image.filter(Boolean)
    : (args.reference_image_url ? [args.reference_image_url] : []);
  const currentImages = Array.isArray(ctx.currentUserImages)
    ? ctx.currentUserImages.filter(Boolean)
    : [];

  if (argImages.length === 0) return currentImages;
  if (currentImages.length > 0 && argImages.every((image) => !isLocalOrInlineImageRef(image))) {
    return currentImages;
  }
  return argImages;
}

async function resolveImageInputForTool(value) {
  const str = String(value || '').trim();
  if (!str) return '';
  if (str.startsWith('data:')) return str;
  if (str.startsWith('/api/files/') || str.startsWith('/api/outputs/') || str.startsWith('/api/assistant/files/')) {
    return await fileToBase64(str);
  }
  if (str.startsWith('http://') || str.startsWith('https://')) return str;

  const viaOutputs = await fileToBase64(`/api/outputs/${str}`);
  if (viaOutputs && viaOutputs.startsWith('data:')) return viaOutputs;
  const viaFiles = await fileToBase64(`/api/files/${str}`);
  return viaFiles || str;
}

async function resolveMediaInputForTool(value) {
  return resolveImageInputForTool(value);
}

function buildCurrentTimeResult(timezoneInput) {
  const timezone = cleanString(timezoneInput, 120) || Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai';
  const now = new Date();
  let local;

  try {
    local = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      timeZoneName: 'short',
    }).format(now);
  } catch {
    throw new Error(`Invalid timezone: ${timezone}`);
  }

  return {
    type: 'current_time',
    timezone,
    iso: now.toISOString(),
    local,
    epochMs: now.getTime(),
  };
}

function normalizeGroundingText(value) {
  return cleanString(value, 12000).toLowerCase().replace(/\s+/g, ' ');
}

function isGroundedInCurrentRequest(value, currentUserText) {
  const needle = normalizeGroundingText(value);
  if (!needle) return false;
  return normalizeGroundingText(currentUserText).includes(needle);
}

function collectWorkflowInputStrings(inputs) {
  if (!inputs || typeof inputs !== 'object' || Array.isArray(inputs)) return [];
  return Object.values(inputs)
    .flatMap((value) => {
      if (typeof value === 'string') return [value];
      if (Array.isArray(value)) return value.filter((item) => typeof item === 'string');
      return [];
    })
    .map((value) => cleanString(value, 4000))
    .filter(Boolean);
}

function assertWorkflowExecutionGrounded(args, ctx) {
  if (typeof ctx.currentUserText !== 'string') return;

  const workflowId = cleanString(args.workflowId, 120);
  const workflowName = cleanString(args.workflowName, 200);
  const hasGroundedTarget = [workflowId, workflowName].some((value) => isGroundedInCurrentRequest(value, ctx.currentUserText));
  if (!hasGroundedTarget) {
    throw new Error('Workflow execution must be grounded in the current user request; memory or prior context cannot choose the workflow target.');
  }

  const ungroundedInputs = collectWorkflowInputStrings(args.inputs)
    .filter((value) => !isGroundedInCurrentRequest(value, ctx.currentUserText));
  if (ungroundedInputs.length > 0) {
    throw new Error('Workflow input overrides must come from the current user request; memory or prior context cannot supply workflow inputs.');
  }
}

function hasTool(profile, toolName) {
  const normalizedName = normalizeToolName(toolName);
  if (normalizedName === 'conversation_summarize') return true;
  if (normalizedName === 'memory_write' && profile?.behavior?.memoryMode === 'off') return false;
  return !profile?.enabledTools?.length || profile.enabledTools.some((item) => normalizeToolName(item) === normalizedName);
}

export class ToolRegistry {
  constructor({ capabilitiesService, memoryService, executionService }) {
    this.capabilitiesService = capabilitiesService;
    this.memoryService = memoryService;
    this.executionService = executionService;
    this.tools = [
      {
        name: 'web_search',
        description: 'Search the web for current information.',
        sideEffectLevel: 'low',
        inputSchema: schemaObject({
          query: { type: 'string' },
          maxResults: { type: 'number' },
          includeAnswer: { type: 'boolean' },
        }, ['query']),
        handler: async (args, ctx) => {
          if (!ctx.allowWebSearch) return 'Web search is disabled for this request.';
          const query = cleanString(args.query, 4000);
          const maxResults = normalizePositiveInteger(args.maxResults, 5);
          const data = await this.capabilitiesService.search({
            apiConfig: ctx.apiConfig || {},
            query,
            maxResults,
            includeAnswer: args.includeAnswer !== false,
          });
          return jsonOrText(data.structured || {
            type: 'web_search_result',
            provider: 'unknown',
            query,
            answer: '',
            resultCount: 0,
            results: [],
            content: data.content || '',
            raw: data.raw ?? data,
          });
        },
      },
      {
        name: 'search_memory',
        description: 'Search agent memories.',
        sideEffectLevel: 'low',
        inputSchema: schemaObject({
          query: { type: 'string' },
          limit: { type: 'number' },
        }, ['query']),
        handler: async (args) => {
          const query = cleanString(args.query, 4000);
          const matches = this.memoryService.search(query, { limit: Number(args.limit) || 5 });
          return jsonOrText({
            type: 'memory_search_result',
            query,
            resultCount: matches.length,
            governance: {
              role: 'context_only',
              requiresVerification: true,
              workflowExecution: 'Memory must not select workflow targets or supply workflow inputs.',
            },
            results: matches,
          });
        },
      },
      {
        name: 'memory_write',
        description: 'Persist a short, stable memory about the user preference or current conversation. Do not store workflow targets, workflow inputs, run IDs, temporary debug details, or external facts.',
        sideEffectLevel: 'medium',
        inputSchema: schemaObject({
          content: { type: 'string' },
          scope: {
            type: 'string',
            enum: ['global', 'conversation'],
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
          },
          importance: { type: 'number' },
        }, ['content']),
        handler: async (args, ctx) => {
          if (ctx.profile?.behavior?.memoryMode === 'off') {
            throw new Error('Memory is disabled for this profile.');
          }
          const result = this.memoryService.writeFromTool({
            content: args.content,
            scope: cleanString(args.scope, 40),
            tags: args.tags,
            importance: args.importance,
            conversationId: ctx.conversationId,
          });
          return jsonOrText(result);
        },
      },
      {
        name: 'get_current_time',
        description: 'Get the current local time.',
        sideEffectLevel: 'low',
        inputSchema: schemaObject({
          timezone: { type: 'string' },
        }, []),
        handler: async (args) => {
          return jsonOrText(buildCurrentTimeResult(args.timezone));
        },
      },
      {
        name: 'conversation_summarize',
        description: 'Summarize the current conversation to compress context when it becomes long. Use this to retain key information while freeing up context space for continued reasoning. Call this proactively when the conversation is getting lengthy.',
        sideEffectLevel: 'low',
        inputSchema: schemaObject({
          instruction: { type: 'string' },
        }, []),
        handler: async (args, ctx) => {
          const instruction = cleanString(args.instruction, 500)
            || 'Summarize the key points, decisions, and current state of this conversation concisely. Retain important details and omit redundancy.';
          const conversation = Array.isArray(ctx.conversation) ? ctx.conversation : [];
          if (conversation.length === 0) {
            return jsonOrText({
              type: 'conversation_summarize_result',
              summary: '',
              originalMessageCount: 0,
              compressedAt: new Date().toISOString(),
            });
          }

          const conversationText = conversation
            .map((msg) => {
              const role = cleanString(msg.role, 20) || 'unknown';
              const content = typeof msg.content === 'string'
                ? msg.content
                : JSON.stringify(msg.content);
              return `[${role}]: ${cleanString(content, 4000)}`;
            })
            .join('\n');

          const response = await this.capabilitiesService.chat({
            model: ctx.model || 'deepseek-v4-flash',
            messages: [
              { role: 'system', content: 'You are a conversation summarizer. Output only the summary text in a single paragraph, no extra commentary or formatting.' },
              { role: 'user', content: `${instruction}\n\nConversation:\n${conversationText}` },
            ],
            apiConfig: ctx.apiConfig || {},
            signal: ctx.signal,
          });

          const choice = response?.choices?.[0] || {};
          const summaryContent = typeof choice.message?.content === 'string' ? choice.message.content : '';
          const summary = cleanString(summaryContent, 8000) || 'Unable to generate summary.';

          return jsonOrText({
            type: 'conversation_summarize_result',
            summary,
            originalMessageCount: conversation.length,
            compressedAt: new Date().toISOString(),
          });
        },
      },
      {
        name: 'generate_image',
        description: 'Generate or edit images. If model is omitted, the backend auto-selects only when exactly one image model is configured. To edit a previously generated image, pass its "ref" (e.g. "abc123.png") from the images array in the last generate_image result via the image or reference_image_url parameter. Only pass refs for images you intend to edit; each one will be uploaded as base64.',
        sideEffectLevel: 'medium',
        inputSchema: schemaObject({
          model: { type: 'string' },
          prompt: { type: 'string' },
          image: {
            type: 'array',
            items: { type: 'string' },
          },
          reference_image_url: { type: 'string' },
          mask: { type: 'string' },
          ratio: {
            type: 'string',
            enum: ['auto', '1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3'],
          },
          width: { type: 'number' },
          height: { type: 'number' },
          quality: {
            type: 'string',
            enum: ['low', 'medium', 'high', 'auto'],
            description: 'Use medium instead of standard, and high instead of hd.',
          },
          resolution: {
            type: 'string',
            enum: ['auto', '512px', '1k', '2k', '4k'],
            description: 'Preferred output tier. Prefer this over quality for image models with -512px, -1k, -2k, or -4k variants.',
          },
          n: { type: 'number' },
          output_format: {
            type: 'string',
            enum: ['png', 'jpeg', 'webp'],
          },
        }, ['prompt']),
        handler: async (args, ctx) => {
          let images = resolveImageRefsForToolArgs(args, ctx);
          if (images.length > 0) {
            images = await Promise.all(images.map(resolveImageInputForTool));
          }
          try {
            const data = await this.capabilitiesService.image({
              apiConfig: ctx.apiConfig || {},
              model: cleanString(args.model, 200),
              prompt: cleanString(args.prompt, 12000),
              image: images,
              mask: args.mask ? await resolveImageInputForTool(args.mask) : '',
              ratio: normalizeImageRatio(args.ratio ?? args.aspect_ratio),
              width: args.width,
              height: args.height,
              quality: normalizeImageQuality(args.quality),
              ...(normalizeImageResolution(args.resolution || args.output_resolution || args.outputResolution)
                ? { resolution: normalizeImageResolution(args.resolution || args.output_resolution || args.outputResolution) }
                : {}),
              n: args.n,
              output_format: normalizeImageOutputFormat(args.output_format),
            });
            return jsonOrText(normalizeImageToolResult(data));
          } catch (error) {
            if (error?.code === 'IMAGE_MODEL_AMBIGUOUS') {
              return jsonOrText({
                type: 'tool_needs_clarification',
                reason: 'multiple_image_models_available',
                message: error.message,
                operation: error.details?.operation,
                candidates: error.details?.candidates || [],
              });
            }
            if (error?.code === 'IMAGE_MODEL_UNAVAILABLE') {
              return jsonOrText({
                type: 'tool_needs_configuration',
                reason: 'no_image_model_available',
                message: error.message,
                operation: error.details?.operation,
              });
            }
            throw error;
          }
        },
      },
      {
        name: 'video_generate',
        description: 'Generate a video from text, image, video, and optional audio inputs. Local refs from prior tool results can be passed through image_url, video_url, or input_audio.',
        sideEffectLevel: 'medium',
        inputSchema: schemaObject({
          model: { type: 'string' },
          prompt: { type: 'string' },
          image_url: { type: 'string' },
          image_urls: {
            type: 'array',
            items: { type: 'string' },
          },
          video_url: { type: 'string' },
          video_urls: {
            type: 'array',
            items: { type: 'string' },
          },
          input_audio: { type: 'string' },
          input_audios: {
            type: 'array',
            items: { type: 'string' },
          },
          duration: {
            type: 'number',
            enum: [-1, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
            description: '-1 means automatic duration; otherwise use an integer from 4 to 15 seconds.',
          },
          aspect_ratio: {
            type: 'string',
            enum: ['auto', '1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3'],
          },
          resolution: {
            type: 'string',
            enum: ['480p', '720p', '1080p', '2k', '4k'],
          },
        }, ['prompt']),
        handler: async (args, ctx) => {
          const imageValues = Array.isArray(args.image_urls) ? args.image_urls : [args.image_url];
          const videoValues = Array.isArray(args.video_urls) ? args.video_urls : [args.video_url];
          const audioValues = Array.isArray(args.input_audios) ? args.input_audios : [args.input_audio];
          const imageUrls = await Promise.all(imageValues.filter(Boolean).map(resolveMediaInputForTool));
          const videoUrls = await Promise.all(videoValues.filter(Boolean).map(resolveMediaInputForTool));
          const audioUrls = await Promise.all(audioValues.filter(Boolean).map(resolveMediaInputForTool));
          const request = {
            model: cleanString(args.model, 200),
            prompt: cleanString(args.prompt, 12000),
            duration: normalizeVideoDuration(args.duration),
            aspect_ratio: normalizeVideoRatio(args.aspect_ratio ?? args.ratio) || 'auto',
            resolution: normalizeVideoResolution(args.resolution) || '720p',
          };
          const data = await this.capabilitiesService.video({
            apiConfig: ctx.apiConfig || {},
            ...request,
            image_url: imageUrls[0] || '',
            image_urls: imageUrls,
            video_url: videoUrls[0] || '',
            video_urls: videoUrls,
            input_audio: audioUrls[0] || '',
            input_audios: audioUrls,
            signal: ctx.signal,
          });
          return jsonOrText(normalizeVideoToolResult(data, request));
        },
      },
      ...(this.executionService ? [{
        name: 'workflow_execute',
        description: 'Execute a saved workflow by workflowId or workflowName. Optional inputs can override input nodes by nodeId for this run only.',
        sideEffectLevel: 'medium',
        inputSchema: schemaObject({
          workflowId: { type: 'string' },
          workflowName: { type: 'string' },
          inputs: {
            type: 'object',
            additionalProperties: true,
          },
        }, []),
        handler: async (args, ctx) => {
          assertWorkflowExecutionGrounded(args, ctx);
          const result = await this.executionService.executeForAgent({
            workflowId: cleanString(args.workflowId, 120),
            workflowName: cleanString(args.workflowName, 200),
            inputs: args.inputs,
            apiConfig: ctx.apiConfig || {},
            signal: ctx.signal,
            requestId: ctx.sessionId || 'agent-workflow',
            onRunStarted: ctx.onWorkflowRunStarted,
          });
          return jsonOrText(result);
        },
      }] : []),
    ];
  }

  listTools(profile, options = {}) {
    return this.tools
      .filter((tool) => hasTool(profile, tool.name))
      .filter((tool) => {
        if (tool.name === 'web_search') return options.allowWebSearch !== false;
        return true;
      });
  }

  toModelTools(profile, options = {}) {
    return this.listTools(profile, options).map((tool) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema,
      },
    }));
  }

  async execute(name, args, ctx = {}) {
    const normalizedName = normalizeToolName(name);
    const tool = this.tools.find((item) => item.name === normalizedName);
    if (!tool) {
      throw new Error(`Unknown tool: ${name}`);
    }
    if (!hasTool(ctx.profile, normalizedName)) {
      throw new Error(`Tool is not allowed for this profile: ${name}`);
    }
    if (tool.name === 'web_search' && ctx.allowWebSearch === false) {
      throw new Error('Web search is disabled for this request.');
    }
    return tool.handler(args || {}, ctx);
  }
}

export function createToolRegistry(deps) {
  return new ToolRegistry(deps);
}
