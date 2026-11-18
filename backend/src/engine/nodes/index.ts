import { execute as executeAi } from './ai/index.ts';
import { execute as executeIo } from './io.ts';

export const NODE_EXECUTORS = {
  ai: executeAi,
  io: executeIo,
};
