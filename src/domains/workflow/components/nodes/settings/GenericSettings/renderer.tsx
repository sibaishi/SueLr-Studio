import type { NodeContentProps, NodeContentRenderer } from '../../nodeContentTypes';
import { NodeSettingsContent } from './NodeSettingsContent';

export function createSettingsContentRenderer(nodeType: string): NodeContentRenderer {
  return ({ def, data, nodeId, updateNodeData, outerStyle }: NodeContentProps) => (
    <NodeSettingsContent
      params={def?.params || []}
      nodeType={nodeType}
      nodeId={nodeId}
      data={data}
      outerStyle={outerStyle}
      onChange={(paramId, value) => updateNodeData(nodeId, { [paramId]: value })}
      onPatch={(patch) => updateNodeData(nodeId, patch)}
    />
  );
}
