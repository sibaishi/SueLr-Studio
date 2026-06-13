import { execute as executeAiChat } from './aiChat.ts';
import { execute as executeApiKeyInput } from './apiKeyInput.ts';
import { execute as executeAudioInput } from './audioInput.ts';
import { execute as executeAudioMerge } from './audioMerge.ts';
import { execute as executeImageCompare } from './imageCompare.ts';
import { execute as executeImageGen } from './imageGen.ts';
import { execute as executeImageGenV2 } from './imageGenV2.ts';
import { execute as executeImageInput } from './imageInput.ts';
import { execute as executeImageMerge } from './imageMerge.ts';
import { execute as executeImageResize } from './imageResize.ts';
import { execute as executeImageSplit } from './imageSplit.ts';
import { execute as executeIterateImageRun } from './iterateImageRun.ts';
import { execute as executeIterateRun } from './iterateRun.ts';
import { execute as executeMaskInput } from './maskInput.ts';
import { execute as executeOutput } from './output.ts';
import { execute as executePromptHelper } from './promptHelper.ts';
import { execute as executeSaveFile } from './saveFile.ts';
import { execute as executeTextClean } from './textClean.ts';
import { execute as executeTextInput } from './textInput.ts';
import { execute as executeTextMerge } from './textMerge.ts';
import { execute as executeTextSplit } from './textSplit.ts';
import type { DynamicValue, NodeInputs, ProgressCallback, RuntimeApiConfig, WorkflowNode } from './types.ts';
import { execute as executeVideoGen } from './videoGen.ts';
import { execute as executeVideoInput } from './videoInput.ts';
import { execute as executeVideoMerge } from './videoMerge.ts';

export const NODE_EXECUTORS = {
  textInput: executeTextInput,
  imageInput: executeImageInput,
  maskInput: executeMaskInput,
  imageResize: executeImageResize,
  imageSplit: executeImageSplit,
  videoInput: executeVideoInput,
  audioInput: executeAudioInput,
  apiKeyInput: executeApiKeyInput,
  iterateImageRun: executeIterateImageRun,
  iterateRun: executeIterateRun,
  promptHelper: executePromptHelper,
  textClean: executeTextClean,
  textSplit: executeTextSplit,
  textMerge: executeTextMerge,
  imageMerge: executeImageMerge,
  imageCompare: executeImageCompare,
  videoMerge: executeVideoMerge,
  audioMerge: executeAudioMerge,
  aiChat: executeAiChat,
  imageGen: executeImageGen,
  imageGenV2: executeImageGenV2,
  videoGen: executeVideoGen,
  saveFile: executeSaveFile,
  output: executeOutput,
};
