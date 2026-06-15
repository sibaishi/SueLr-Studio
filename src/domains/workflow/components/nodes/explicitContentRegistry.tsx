import { promptHelperContentRenderer } from './ai/PromptHelper/renderer';
import { groupContentRenderer } from './group/Group/renderer';
import type { NodeContentRenderer } from './nodeContentTypes';

export const explicitContentRenderers: Record<string, NodeContentRenderer> = {
  group: groupContentRenderer,
  promptHelper: promptHelperContentRenderer,
};
