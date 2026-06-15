import { AUDIO_MERGE_NODE } from './audioMerge/index.js';
import { IMAGE_COMPARE_NODE } from './imageCompare/index.js';
import { IMAGE_MERGE_NODE } from './imageMerge/index.js';
import { IMAGE_RESIZE_NODE } from './imageResize/index.js';
import { IMAGE_SPLIT_NODE } from './imageSplit/index.js';
import { PROMPT_HELPER_NODE } from './promptHelper/index.js';
import { TEXT_CLEAN_NODE } from './textClean/index.js';
import { TEXT_MERGE_NODE } from './textMerge/index.js';
import { TEXT_SPLIT_NODE } from './textSplit/index.js';
import { VIDEO_MERGE_NODE } from './videoMerge/index.js';

export {
  AUDIO_MERGE_NODE,
  IMAGE_COMPARE_NODE,
  IMAGE_MERGE_NODE,
  IMAGE_RESIZE_NODE,
  IMAGE_SPLIT_NODE,
  PROMPT_HELPER_NODE,
  TEXT_CLEAN_NODE,
  TEXT_MERGE_NODE,
  TEXT_SPLIT_NODE,
  VIDEO_MERGE_NODE,
};

export const MERGE_NODES = [
  IMAGE_RESIZE_NODE,
  IMAGE_SPLIT_NODE,
  IMAGE_COMPARE_NODE,
  PROMPT_HELPER_NODE,
  TEXT_CLEAN_NODE,
  TEXT_SPLIT_NODE,
  TEXT_MERGE_NODE,
  IMAGE_MERGE_NODE,
  VIDEO_MERGE_NODE,
  AUDIO_MERGE_NODE,
];
