import { promptHelperContentRenderer } from './ai/PromptHelper/renderer';
import { groupContentRenderer } from './group/Group/renderer';
import { apiKeyInputContentRenderer } from './input/ApiKeyInput/renderer';
import { textInputContentRenderer } from './input/TextInput/renderer';
import { imageCompareContentRenderer } from './merge/ImageCompare/renderer';
import type { NodeContentRenderer } from './nodeContentTypes';
import { outputContentRenderer } from './output/Output/renderer';
import { textCleanContentRenderer, textSplitContentRenderer } from './text/TextResultPreview/renderer';

export const explicitContentRenderers: Record<string, NodeContentRenderer> = {
  group: groupContentRenderer,
  textInput: textInputContentRenderer,
  promptHelper: promptHelperContentRenderer,
  apiKeyInput: apiKeyInputContentRenderer,
  imageCompare: imageCompareContentRenderer,
  textClean: textCleanContentRenderer,
  textSplit: textSplitContentRenderer,
  output: outputContentRenderer,
};
