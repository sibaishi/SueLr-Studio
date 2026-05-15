import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { ToolRegistry } from '../src/modules/agent/tool-registry.js';
import { ensureStorageDirectories, STORAGE_PATHS } from '../src/platform/storage/index.js';

function withTempStorage() {
  const previous = process.env.APP_CONFIG_DIR;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'suelr-tool-registry-'));
  process.env.APP_CONFIG_DIR = root;
  ensureStorageDirectories();
  return () => {
    if (previous === undefined) {
      delete process.env.APP_CONFIG_DIR;
    } else {
      process.env.APP_CONFIG_DIR = previous;
    }
    fs.rmSync(root, { recursive: true, force: true });
  };
}

function createRegistry(overrides = {}) {
  return new ToolRegistry({
    capabilitiesService: {
      search: async (payload) => ({
        structured: {
          type: 'web_search_result',
          provider: 'tavily',
          query: payload.query,
          answer: 'summary',
          resultCount: 1,
          results: [{
            title: 'Result title',
            url: 'https://example.com',
            content: 'Result snippet',
          }],
          images: [],
        },
      }),
      image: async () => ({ images: [] }),
      video: async () => ({ video: 'data:video/mp4;base64,QUJD' }),
      ...overrides.capabilitiesService,
    },
    memoryService: {
      search: () => [],
      writeFromTool: () => ({
        type: 'memory_write_result',
        status: 'written',
        memory: {
          id: 'mem-tool',
          scope: 'conversation',
          source: 'chat',
          content: 'User prefers concise answers.',
          tags: ['style'],
          importance: 1,
          conversationId: 'conv-tool',
        },
        governance: {
          role: 'context_only',
          requiresVerification: true,
          workflowExecution: 'Memory must not select workflow targets or supply workflow inputs.',
        },
      }),
      ...overrides.memoryService,
    },
    executionService: overrides.executionService,
  });
}

test('ToolRegistry returns stable structured JSON for web_search', async () => {
  let called = null;
  const registry = createRegistry({
    capabilitiesService: {
      search: async (payload) => {
        called = payload;
        return {
          structured: {
            type: 'web_search_result',
            provider: 'tavily',
            query: payload.query,
            answer: 'phase one summary',
            resultCount: 1,
            results: [{
              title: 'Phase one',
              url: 'https://example.com/phase-one',
              content: 'Search result content',
              score: 0.9,
            }],
            images: [],
          },
        };
      },
    },
  });

  const result = await registry.execute('web.search', {
    query: ' phase 1 ',
    maxResults: 99,
  }, {
    allowWebSearch: true,
    profile: {
      enabledTools: ['web_search'],
    },
    apiConfig: { tavilyApiKey: 'demo' },
  });

  const parsed = JSON.parse(result);
  assert.equal(parsed.type, 'web_search_result');
  assert.equal(parsed.provider, 'tavily');
  assert.equal(parsed.query, 'phase 1');
  assert.equal(parsed.resultCount, 1);
  assert.equal(parsed.results[0].url, 'https://example.com/phase-one');
  assert.deepEqual(called, {
    apiConfig: { tavilyApiKey: 'demo' },
    query: 'phase 1',
    maxResults: 20,
    includeAnswer: true,
  });
});

test('ToolRegistry uses enabledTools as the profile tool permission source except conversation_summarize', async () => {
  const registry = createRegistry();
  const profile = {
    enabledTools: ['get_current_time'],
  };

  assert.deepEqual(
    registry.toModelTools(profile, { allowWebSearch: true }).map((tool) => tool.function.name),
    ['get_current_time', 'conversation_summarize'],
  );

  assert.deepEqual(
    registry.toModelTools({
      enabledTools: ['web_search', 'get_current_time'],
    }, { allowWebSearch: false }).map((tool) => tool.function.name),
    ['get_current_time', 'conversation_summarize'],
  );

  await assert.rejects(
    registry.execute('web_search', { query: 'latest' }, { allowWebSearch: true, profile }),
    /Tool is not allowed/,
  );
});

test('ToolRegistry returns stable structured JSON for get_current_time', async () => {
  const registry = createRegistry();

  const result = await registry.execute('get_current_time', {
    timezone: 'UTC',
  }, {
    profile: {
      enabledTools: ['get_current_time'],
    },
  });

  const parsed = JSON.parse(result);
  assert.equal(parsed.type, 'current_time');
  assert.equal(parsed.timezone, 'UTC');
  assert.match(parsed.iso, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(typeof parsed.local, 'string');
  assert.equal(typeof parsed.epochMs, 'number');
});

test('ToolRegistry returns governed structured JSON for search_memory', async () => {
  const registry = createRegistry({
    memoryService: {
      search: (query, options) => [{
        id: 'mem-1',
        content: 'User prefers concise answers.',
        score: 11,
        query,
        options,
      }],
    },
  });

  const result = await registry.execute('memory.search', {
    query: ' concise ',
    limit: 3,
  }, {
    profile: {
      enabledTools: ['search_memory'],
    },
  });

  const parsed = JSON.parse(result);
  assert.equal(parsed.type, 'memory_search_result');
  assert.equal(parsed.query, 'concise');
  assert.equal(parsed.resultCount, 1);
  assert.equal(parsed.governance.role, 'context_only');
  assert.equal(parsed.governance.workflowExecution, 'Memory must not select workflow targets or supply workflow inputs.');
  assert.equal(parsed.results[0].id, 'mem-1');
});

test('ToolRegistry exposes memory_write with alias and forwards scoped writes', async () => {
  let called = null;
  const registry = createRegistry({
    memoryService: {
      search: () => [],
      writeFromTool: (payload) => {
        called = payload;
        return {
          type: 'memory_write_result',
          status: 'written',
          memory: {
            id: 'mem-written',
            scope: 'conversation',
            source: 'chat',
            content: payload.content,
            tags: payload.tags,
            importance: 2,
            conversationId: payload.conversationId,
          },
          governance: {
            role: 'context_only',
            requiresVerification: true,
            workflowExecution: 'Memory must not select workflow targets or supply workflow inputs.',
          },
        };
      },
    },
  });

  const tools = registry.toModelTools({
    enabledTools: ['memory_write'],
    behavior: { memoryMode: 'auto' },
  });
  assert.ok(tools.some((tool) => tool.function.name === 'memory_write'));

  const result = await registry.execute('memory.write', {
    content: ' User prefers concise answers. ',
    scope: 'conversation',
    tags: ['style'],
    importance: 2,
  }, {
    profile: {
      enabledTools: ['memory_write'],
      behavior: { memoryMode: 'auto' },
    },
    conversationId: 'conv-tool',
  });

  const parsed = JSON.parse(result);
  assert.equal(parsed.type, 'memory_write_result');
  assert.equal(parsed.status, 'written');
  assert.equal(parsed.memory.conversationId, 'conv-tool');
  assert.equal(parsed.governance.role, 'context_only');
  assert.deepEqual(called, {
    content: ' User prefers concise answers. ',
    scope: 'conversation',
    tags: ['style'],
    importance: 2,
    conversationId: 'conv-tool',
  });
});

test('ToolRegistry hides and blocks memory_write when memory mode is off', async () => {
  const registry = createRegistry();
  const profile = {
    enabledTools: ['memory_write'],
    behavior: { memoryMode: 'off' },
  };

  assert.equal(
    registry.toModelTools(profile).some((tool) => tool.function.name === 'memory_write'),
    false,
  );

  await assert.rejects(
    registry.execute('memory_write', { content: 'User prefers concise answers.' }, { profile }),
    /not allowed|Memory is disabled/i,
  );
});

test('ToolRegistry forwards generate_image requests with runtime config and optional model', async () => {
  let called = null;
  const registry = createRegistry({
    capabilitiesService: {
      image: async (payload) => {
        called = payload;
        return {
          images: ['data:image/png;base64,YWJj'],
          rawImages: ['data:image/png;base64,SHOULD_NOT_LEAK'],
          rawData: [{ data: [{ b64_json: 'SHOULD_NOT_LEAK' }] }],
          request: {
            model: 'auto-selected-image-model',
          },
        };
      },
    },
  });

  const tools = registry.toModelTools({
    enabledTools: ['generate_image'],
  });
  const imageTool = tools.find((tool) => tool.function.name === 'generate_image');
  assert.ok(imageTool);
  assert.deepEqual(imageTool.function.parameters.required, ['prompt']);

  const result = await registry.execute('generate_image', {
    prompt: ' turn this into watercolor ',
    reference_image_url: 'data:image/png;base64,QUJD',
    quality: 'high',
    width: 1024,
    height: 1024,
  }, {
    profile: {
      enabledTools: ['generate_image'],
    },
    apiConfig: {
      apiKey: 'demo',
      projectModels: [{
        modelId: 'auto-selected-image-model',
        type: 'image',
        enabled: true,
        endpointMode: 'category',
        endpointCategory: 'image',
      }],
    },
  });

  const parsed = JSON.parse(result);
  assert.deepEqual(parsed.images, ['data:image/png;base64,YWJj']);
  assert.equal(parsed.type, 'image_generation_result');
  assert.equal(parsed.rawImages, undefined);
  assert.equal(parsed.rawData, undefined);
  assert.deepEqual(parsed.artifacts, [{
    type: 'image',
    url: 'data:image/png;base64,YWJj',
    name: 'generated-image-1',
  }]);
  assert.deepEqual(called, {
    apiConfig: {
      apiKey: 'demo',
      projectModels: [{
        modelId: 'auto-selected-image-model',
        type: 'image',
        enabled: true,
        endpointMode: 'category',
        endpointCategory: 'image',
      }],
    },
    model: '',
    prompt: 'turn this into watercolor',
    image: ['data:image/png;base64,QUJD'],
    mask: '',
    ratio: '',
    width: 1024,
    height: 1024,
    quality: 'high',
    n: undefined,
    output_format: '',
  });
});

test('ToolRegistry normalizes generate_image request aliases before calling capabilities', async () => {
  let called = null;
  const registry = createRegistry({
    capabilitiesService: {
      image: async (payload) => {
        called = payload;
        return { images: ['/api/outputs/chicken.png'] };
      },
    },
  });

  await registry.execute('generate_image', {
    prompt: 'generate a chicken',
    ratio: '3：4',
    quality: 'standard',
    output_format: 'jpg',
  }, {
    profile: {
      enabledTools: ['generate_image'],
    },
  });

  assert.equal(called.ratio, '3:4');
  assert.equal(called.quality, 'medium');
  assert.equal(called.output_format, 'jpeg');

  await registry.execute('generate_image', {
    prompt: 'generate a chicken',
    aspect_ratio: '3:4',
    quality: 'hd',
  }, {
    profile: {
      enabledTools: ['generate_image'],
    },
  });

  assert.equal(called.ratio, '3:4');
  assert.equal(called.quality, 'high');
});

test('ToolRegistry uses current user images for generate_image edits when tool args omit image', async () => {
  const cleanup = withTempStorage();
  try {
    fs.writeFileSync(path.join(STORAGE_PATHS.uploadsDir, 'edit-source.png'), Buffer.from('ABC'));
    let called = null;
    const registry = createRegistry({
      capabilitiesService: {
        image: async (payload) => {
          called = payload;
          return { images: ['/api/outputs/generated.png'] };
        },
      },
    });

    await registry.execute('generate_image', {
      prompt: 'make the uploaded image watercolor',
    }, {
      profile: {
        enabledTools: ['generate_image'],
      },
      currentUserImages: ['/api/files/edit-source.png'],
    });

    assert.deepEqual(called.image, ['data:image/png;base64,QUJD']);
  } finally {
    cleanup();
  }
});

test('ToolRegistry prefers current local chat image over model-supplied remote reference URL', async () => {
  const cleanup = withTempStorage();
  try {
    fs.writeFileSync(path.join(STORAGE_PATHS.uploadsDir, 'selected-source.png'), Buffer.from('ABC'));
    let called = null;
    const registry = createRegistry({
      capabilitiesService: {
        image: async (payload) => {
          called = payload;
          return { images: ['/api/outputs/generated.png'] };
        },
      },
    });

    await registry.execute('generate_image', {
      prompt: 'make this brighter',
      reference_image_url: 'https://files.oaiusercontent.com/expired-reference.webp',
    }, {
      profile: {
        enabledTools: ['generate_image'],
      },
      currentUserImages: ['/api/files/selected-source.png'],
    });

    assert.deepEqual(called.image, ['data:image/png;base64,QUJD']);
  } finally {
    cleanup();
  }
});

test('ToolRegistry returns clarification payload when generate_image has multiple model candidates', async () => {
  const registry = createRegistry({
    capabilitiesService: {
      image: async () => {
        const error = new Error('Multiple image models are available; please specify one: image-a, image-b');
        error.code = 'IMAGE_MODEL_AMBIGUOUS';
        error.details = {
          operation: 'generate',
          candidates: [
            { model: 'image-a', endpointCategory: 'image' },
            { model: 'image-b', endpointCategory: 'image' },
          ],
        };
        throw error;
      },
    },
  });

  const result = await registry.execute('generate_image', {
    prompt: 'draw a mountain',
  }, {
    profile: {
      enabledTools: ['generate_image'],
    },
    apiConfig: {},
  });

  const parsed = JSON.parse(result);
  assert.equal(parsed.type, 'tool_needs_clarification');
  assert.equal(parsed.reason, 'multiple_image_models_available');
  assert.equal(parsed.operation, 'generate');
  assert.deepEqual(parsed.candidates.map((candidate) => candidate.model), ['image-a', 'image-b']);
});

test('ToolRegistry exposes video_generate aliases and returns video artifacts', async () => {
  let called = null;
  const registry = createRegistry({
    capabilitiesService: {
      video: async (payload) => {
        called = payload;
        return { video: 'data:video/mp4;base64,QUJD' };
      },
    },
  });

  const tools = registry.toModelTools({
    enabledTools: ['video_generate'],
  });
  const videoTool = tools.find((tool) => tool.function.name === 'video_generate');
  assert.ok(videoTool);
  assert.deepEqual(videoTool.function.parameters.required, ['prompt']);

  const result = await registry.execute('video.generate', {
    prompt: 'make a short product video',
    image_url: 'data:image/png;base64,QUJD',
    input_audio: 'data:audio/mp3;base64,QUJD',
    duration: 10,
    aspect_ratio: '9:16',
    resolution: '1080p',
  }, {
    profile: {
      enabledTools: ['video_generate'],
    },
    apiConfig: { apiKey: 'demo' },
    signal: null,
  });

  const parsed = JSON.parse(result);
  assert.equal(parsed.type, 'video_generation_result');
  assert.equal(parsed.tool, 'video_generate');
  assert.equal(parsed.status, 'completed');
  assert.deepEqual(parsed.videos, ['data:video/mp4;base64,QUJD']);
  assert.deepEqual(parsed.artifacts, [{
    type: 'video',
    url: 'data:video/mp4;base64,QUJD',
    name: 'generated-video-1',
  }]);
  assert.deepEqual(called, {
    apiConfig: { apiKey: 'demo' },
    model: '',
    prompt: 'make a short product video',
    duration: 10,
    aspect_ratio: '9:16',
    resolution: '1080p',
    image_url: 'data:image/png;base64,QUJD',
    image_urls: ['data:image/png;base64,QUJD'],
    video_url: '',
    video_urls: [],
    input_audio: 'data:audio/mp3;base64,QUJD',
    input_audios: ['data:audio/mp3;base64,QUJD'],
    signal: null,
  });
});

test('ToolRegistry exposes workflow_execute and forwards workflow execution to executionService', async () => {
  let called = null;
  const registry = createRegistry({
    executionService: {
      async executeForAgent(payload) {
        called = payload;
        return {
          runId: 'run_workflow_tool',
          workflowId: 'wf_saved',
          workflowName: 'Saved Workflow',
          status: 'completed',
          keyOutputs: [],
          summary: 'workflow ok',
        };
      },
    },
  });

  const tools = registry.toModelTools({
    enabledTools: ['workflow_execute'],
  });
  assert.ok(tools.some((tool) => tool.function.name === 'workflow_execute'));

  const result = await registry.execute('workflow.execute', { workflowName: 'Saved Workflow' }, {
    profile: {
      enabledTools: ['workflow_execute'],
    },
    apiConfig: { apiKey: 'demo' },
    signal: null,
    sessionId: 'agent-session-workflow',
  });

  assert.equal(typeof result, 'string');
  assert.ok(result.includes('"workflowId":"wf_saved"'));
  assert.deepEqual(called, {
    workflowId: '',
    workflowName: 'Saved Workflow',
    inputs: undefined,
    apiConfig: { apiKey: 'demo' },
    signal: null,
    requestId: 'agent-session-workflow',
    onRunStarted: undefined,
  });
});

test('ToolRegistry rejects workflow execution targets that are not grounded in the current request', async () => {
  const registry = createRegistry({
    executionService: {
      async executeForAgent() {
        throw new Error('execution should be blocked before service call');
      },
    },
  });

  await assert.rejects(
    registry.execute('workflow_execute', {
      workflowName: 'Remembered Workflow',
    }, {
      profile: {
        enabledTools: ['workflow_execute'],
      },
      currentUserText: 'Run the workflow I mentioned earlier.',
    }),
    /current user request/i,
  );
});

test('ToolRegistry rejects workflow input overrides that are not grounded in the current request', async () => {
  const registry = createRegistry({
    executionService: {
      async executeForAgent() {
        throw new Error('execution should be blocked before service call');
      },
    },
  });

  await assert.rejects(
    registry.execute('workflow_execute', {
      workflowName: 'Saved Workflow',
      inputs: {
        prompt: 'remembered prompt',
      },
    }, {
      profile: {
        enabledTools: ['workflow_execute'],
      },
      currentUserText: 'Run Saved Workflow.',
    }),
    /input overrides/i,
  );
});

test('ToolRegistry forwards workflow input overrides to executionService', async () => {
  let called = null;
  const registry = createRegistry({
    executionService: {
      async executeForAgent(payload) {
        called = payload;
        return { status: 'completed' };
      },
    },
  });

  await registry.execute('workflow_execute', {
    workflowId: 'wf_saved',
    inputs: {
      node_prompt: 'Updated prompt',
    },
  }, {
    profile: {
      enabledTools: ['workflow_execute'],
    },
    apiConfig: {},
    signal: null,
    sessionId: 'session-2',
    onWorkflowRunStarted() {},
  });

  assert.deepEqual(called, {
    workflowId: 'wf_saved',
    workflowName: '',
    inputs: {
      node_prompt: 'Updated prompt',
    },
    apiConfig: {},
    signal: null,
    requestId: 'session-2',
    onRunStarted: called.onRunStarted,
  });
  assert.equal(typeof called.onRunStarted, 'function');
});
