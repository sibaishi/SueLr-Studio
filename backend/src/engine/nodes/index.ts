import { execute as executeAiV3 } from './aiV3/index.ts';
import { execute as executeIo } from './io.ts';

export const NODE_EXECUTORS = {
  aiV3: executeAiV3,
  io: executeIo,
};
