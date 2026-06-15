import { aiV3ContentRenderer } from './ai/AiV3/renderer';
import { ioContentRenderer } from './io/Io/renderer';
import { imageResizeContentRenderer } from './merge/ImageResize/renderer';
import { imageSplitContentRenderer } from './merge/ImageSplit/renderer';
import type { NodeContentRenderer } from './nodeContentTypes';
import { saveFileContentRenderer } from './output/SaveFile/renderer';

const settingsContentRenderers: Record<string, NodeContentRenderer> = {
  imageResize: imageResizeContentRenderer,
  imageSplit: imageSplitContentRenderer,
  aiV3: aiV3ContentRenderer,
  io: ioContentRenderer,
  saveFile: saveFileContentRenderer,
};

export function resolveSettingsContentRenderer(type: string): NodeContentRenderer | undefined {
  return settingsContentRenderers[type];
}
