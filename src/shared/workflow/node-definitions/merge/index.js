import { MATERIAL_PROCESS_NODE } from './materialProcess/index.js';
import { PROMPT_HELPER_NODE } from './promptHelper/index.js';

export { MATERIAL_PROCESS_NODE, PROMPT_HELPER_NODE };

export const MERGE_NODES = [
  MATERIAL_PROCESS_NODE,
  PROMPT_HELPER_NODE,
];
