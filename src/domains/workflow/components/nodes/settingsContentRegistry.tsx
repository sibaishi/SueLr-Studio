import { aiChatContentRenderer } from './ai/AiChat/renderer';
import { imageGenContentRenderer } from './ai/ImageGen/renderer';
import { aiChatV2ContentRenderer } from './ai/AiChatV2/renderer';
import { imageGenV2ContentRenderer } from './ai/ImageGenV2/renderer';
import { videoGenV2ContentRenderer } from './ai/VideoGenV2/renderer';
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
  imageGenV2: imageGenV2ContentRenderer,
  videoGenV2: videoGenV2ContentRenderer,
  aiChatV2: aiChatV2ContentRenderer,
  videoGen: videoGenContentRenderer,
  saveFile: saveFileContentRenderer,
};

export function resolveSettingsContentRenderer(type: string): NodeContentRenderer | undefined {
  return settingsContentRenderers[type];
}
