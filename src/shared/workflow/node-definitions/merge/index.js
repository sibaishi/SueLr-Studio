import { IMAGE_COMPARE_NODE } from './imageCompare/index.js';
import { IMAGE_SPLIT_NODE } from './imageSplit/index.js';
import { ITERATE_IMAGE_RUN_NODE } from './iterateImageRun/index.js';
import { ITERATE_RUN_NODE } from './iterateRun/index.js';
import { PROMPT_HELPER_NODE } from './promptHelper/index.js';
import { TEXT_CLEAN_NODE } from './textClean/index.js';
import { TEXT_SPLIT_NODE } from './textSplit/index.js';

export {
  IMAGE_COMPARE_NODE,
  IMAGE_SPLIT_NODE,
  ITERATE_IMAGE_RUN_NODE,
  ITERATE_RUN_NODE,
  PROMPT_HELPER_NODE,
  TEXT_CLEAN_NODE,
  TEXT_SPLIT_NODE,
};

export const MERGE_NODES = [
  IMAGE_SPLIT_NODE,
  IMAGE_COMPARE_NODE,
  ITERATE_RUN_NODE,
  ITERATE_IMAGE_RUN_NODE,
  PROMPT_HELPER_NODE,
  TEXT_CLEAN_NODE,
  TEXT_SPLIT_NODE,
];
