import { AUDIO_INPUT_NODE } from './audioInput/index.js';
import { IMAGE_INPUT_NODE } from './imageInput/index.js';
import { MASK_INPUT_NODE } from './maskInput/index.js';
import { TEXT_INPUT_NODE } from './textInput/index.js';
import { VIDEO_INPUT_NODE } from './videoInput/index.js';

export const INPUT_NODES = [
  TEXT_INPUT_NODE,
  IMAGE_INPUT_NODE,
  MASK_INPUT_NODE,
  VIDEO_INPUT_NODE,
  AUDIO_INPUT_NODE,
];
