import { execute as executeAiV3 } from './aiV3.ts';
import { execute as executeIo } from './io.ts';
import { execute as executeImageSplit } from './imageSplit.ts';
import { execute as executePromptHelper } from './promptHelper.ts';
import { execute as executeTextClean } from './textClean.ts';
import { execute as executeTextSplit } from './textSplit.ts';
import type { DynamicValue, NodeInputs, ProgressCallback, RuntimeApiConfig, WorkflowNode } from './types.ts';

export const NODE_EXECUTORS = {
  iterateRun: async () => ({}),
  iterateImageRun: async () => ({}),
  imageSplit: executeImageSplit,
  promptHelper: executePromptHelper,
  textClean: executeTextClean,
  textSplit: executeTextSplit,
  aiV3: executeAiV3,
  io: executeIo,
};
