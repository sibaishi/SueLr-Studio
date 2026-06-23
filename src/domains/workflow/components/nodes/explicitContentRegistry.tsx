import { promptHelperContentRenderer } from './ai/PromptHelper/renderer';
import { groupContentRenderer } from './group/Group/renderer';
import { materialProcessContentRenderer } from './merge/MaterialProcess/renderer';
import type { NodeContentRenderer } from './nodeContentTypes';

export const explicitContentRenderers: Record<string, NodeContentRenderer> = {
  group: groupContentRenderer,
  materialProcess: materialProcessContentRenderer,
  promptHelper: promptHelperContentRenderer,
};
