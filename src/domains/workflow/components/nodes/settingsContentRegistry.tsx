import { aiV3ContentRenderer } from './ai/AiV3/renderer';
import { ioContentRenderer } from './io/Io/renderer';
import { imageSplitContentRenderer } from './merge/ImageSplit/renderer';
import type { NodeContentRenderer } from './nodeContentTypes';

const settingsContentRenderers: Record<string, NodeContentRenderer> = {
  imageSplit: imageSplitContentRenderer,
  aiV3: aiV3ContentRenderer,
  io: ioContentRenderer,
};

export function resolveSettingsContentRenderer(type: string): NodeContentRenderer | undefined {
  return settingsContentRenderers[type];
}
