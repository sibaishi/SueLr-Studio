import type { NodeContentRenderer } from '../../nodeContentTypes';
import { TextResultPreviewContent } from './TextResultPreviewContent';

function createTextResultPreviewRenderer(mode: 'clean' | 'split'): NodeContentRenderer {
  return ({ type, def, data, nodeId, updateNodeData, outputs, outerStyle }) => (
    <TextResultPreviewContent
      params={def?.params || []}
      nodeType={type}
      nodeId={nodeId}
      data={data}
      outputs={outputs}
      outerStyle={outerStyle}
      onChange={(paramId, value) => updateNodeData(nodeId, { [paramId]: value })}
      onPatch={(patch) => updateNodeData(nodeId, patch)}
      mode={mode}
    />
  );
}

export const textCleanContentRenderer = createTextResultPreviewRenderer('clean');
export const textSplitContentRenderer = createTextResultPreviewRenderer('split');
