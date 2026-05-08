import { execute as executeTextInput } from './textInput.js';
import { execute as executeAiChat } from './aiChat.js';
import { execute as executeOutput } from './output.js';
import { execute as executeImageInput } from './imageInput.js';
import { execute as executeMaskInput } from './maskInput.js';
import { execute as executeImageResize } from './imageResize.js';
import { execute as executeVideoInput } from './videoInput.js';
import { execute as executeAudioInput } from './audioInput.js';
import { execute as executeApiKeyInput } from './apiKeyInput.js';
import { execute as executeTextClean } from './textClean.js';
import { execute as executeTextSplit } from './textSplit.js';
import { execute as executeTextMerge } from './textMerge.js';
import { execute as executeImageMerge } from './imageMerge.js';
import { execute as executeVideoMerge } from './videoMerge.js';
import { execute as executeAudioMerge } from './audioMerge.js';
import { execute as executeUniversalMerge } from './universalMerge.js';
import { execute as executeImageGen } from './imageGen.js';
import { execute as executeVideoGen } from './videoGen.js';
import { execute as executeSaveFile } from './saveFile.js';

export const NODE_EXECUTORS = {
  textInput: executeTextInput,
  imageInput: executeImageInput,
  maskInput: executeMaskInput,
  imageResize: executeImageResize,
  videoInput: executeVideoInput,
  audioInput: executeAudioInput,
  apiKeyInput: executeApiKeyInput,
  textClean: executeTextClean,
  textSplit: executeTextSplit,
  textMerge: executeTextMerge,
  imageMerge: executeImageMerge,
  videoMerge: executeVideoMerge,
  audioMerge: executeAudioMerge,
  universalMerge: executeUniversalMerge,
  aiChat: executeAiChat,
  imageGen: executeImageGen,
  videoGen: executeVideoGen,
  saveFile: executeSaveFile,
  output: executeOutput,
};
