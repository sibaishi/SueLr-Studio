import { explicitContentRenderers } from './explicitContentRegistry';
import type { NodeContentRenderer } from './nodeContentTypes';
import { resolveSettingsContentRenderer } from './settingsContentRegistry';

export function resolveNodeContentRenderer(type: string): NodeContentRenderer | undefined {
  return (
    explicitContentRenderers[type] ||
    resolveSettingsContentRenderer(type)
  );
}
