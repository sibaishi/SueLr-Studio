import { fileInputContentRenderers } from './input/FileInput/renderer';
import type { NodeContentRenderer } from './nodeContentTypes';

export function resolveFileInputContentRenderer(type: string): NodeContentRenderer | undefined {
  return fileInputContentRenderers[type];
}
