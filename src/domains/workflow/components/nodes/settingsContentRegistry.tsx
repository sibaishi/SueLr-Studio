import { aiV3ContentRenderer } from './ai/AiV3/renderer';
import { ioContentRenderer } from './io/Io/renderer';
import type { NodeContentRenderer } from './nodeContentTypes';

const settingsContentRenderers: Record<string, NodeContentRenderer> = {
  aiV3: aiV3ContentRenderer,
  io: ioContentRenderer,
};

export function resolveSettingsContentRenderer(type: string): NodeContentRenderer | undefined {
  return settingsContentRenderers[type];
}
