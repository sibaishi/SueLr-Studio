import { aiContentRenderer } from './ai/Ai/renderer';
import { ioContentRenderer } from './io/Io/renderer';
import type { NodeContentRenderer } from './nodeContentTypes';

const settingsContentRenderers: Record<string, NodeContentRenderer> = {
  ai: aiContentRenderer,
  io: ioContentRenderer,
};

export function resolveSettingsContentRenderer(type: string): NodeContentRenderer | undefined {
  return settingsContentRenderers[type];
}
