import { explicitContentRenderers } from './explicitContentRegistry';
import { resolveFileInputContentRenderer } from './fileInputRegistry';
import { resolveMergeContentRenderer } from './mergeContentRegistry';
import type { NodeContentRenderer } from './nodeContentTypes';
import { resolveSettingsContentRenderer } from './settingsContentRegistry';

export function resolveNodeContentRenderer(type: string): NodeContentRenderer | undefined {
  return (
    explicitContentRenderers[type] ||
    resolveFileInputContentRenderer(type) ||
    resolveSettingsContentRenderer(type) ||
    resolveMergeContentRenderer(type)
  );
}
