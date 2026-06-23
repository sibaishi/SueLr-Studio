import { execute as executeAiV3 } from './aiV3/index.ts';
import { execute as executeIo } from './io.ts';
import { execute as executeMaterialProcess } from './materialProcess.ts';
import { execute as executePromptHelper } from './promptHelper.ts';
import type { DynamicValue, NodeInputs, ProgressCallback, RuntimeApiConfig, WorkflowNode } from './types.ts';

export const NODE_EXECUTORS = {
  materialProcess: executeMaterialProcess,
  promptHelper: executePromptHelper,
  aiV3: executeAiV3,
  io: executeIo,
};
