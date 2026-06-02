import { aiChatContentRenderer } from './ai/AiChat/renderer';
import { imageGenContentRenderer } from './ai/ImageGen/renderer';
import { videoGenContentRenderer } from './ai/VideoGen/renderer';
import { imageResizeContentRenderer } from './merge/ImageResize/renderer';
import { imageSplitContentRenderer } from './merge/ImageSplit/renderer';
import type { NodeContentRenderer } from './nodeContentTypes';
import { saveFileContentRenderer } from './output/SaveFile/renderer';

const settingsContentRenderers: Record<string, NodeContentRenderer> = {
  imageResize: imageResizeContentRenderer,
  imageSplit: imageSplitContentRenderer,
  aiChat: aiChatContentRenderer,
  imageGen: imageGenContentRenderer,
  videoGen: videoGenContentRenderer,
  saveFile: saveFileContentRenderer,
};

export function resolveSettingsContentRenderer(type: string): NodeContentRenderer | undefined {
  return settingsContentRenderers[type];
}
