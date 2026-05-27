import { mergeContentRenderers } from './merge/UniversalMerge/renderer';
import type { NodeContentRenderer } from './nodeContentTypes';

export function resolveMergeContentRenderer(type: string): NodeContentRenderer | undefined {
  return mergeContentRenderers[type];
}
