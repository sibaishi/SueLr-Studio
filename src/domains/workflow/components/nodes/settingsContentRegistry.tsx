import { aiV3ContentRenderer } from './ai/AiV3/renderer';
import { ioContentRenderer } from './io/Io/renderer';
import { imageResizeContentRenderer } from './merge/ImageResize/renderer';
import { imageSplitContentRenderer } from './merge/ImageSplit/renderer';
import type { NodeContentRenderer } from './nodeContentTypes';

const settingsContentRenderers: Record<string, NodeContentRenderer> = {
  imageResize: imageResizeContentRenderer,
  imageSplit: imageSplitContentRenderer,
  aiV3: aiV3ContentRenderer,
  io: ioContentRenderer,
};

export function resolveSettingsContentRenderer(type: string): NodeContentRenderer | undefined {
  return settingsContentRenderers[type];
}
