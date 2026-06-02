import type { NodeContentRenderer } from '../../nodeContentTypes';
import { ImageSplitContent } from './ImageSplitContent';

export const imageSplitContentRenderer: NodeContentRenderer = ({
  type,
  def,
  data,
  nodeId,
  updateNodeData,
  outputs,
  outerStyle,
}) => (
  <ImageSplitContent
    params={def?.params || []}
    nodeType={type}
    nodeId={nodeId}
    data={data}
    outputs={outputs}
    outerStyle={outerStyle}
    onChange={(paramId, value) => updateNodeData(nodeId, { [paramId]: value })}
    onPatch={(patch) => updateNodeData(nodeId, patch)}
  />
);
