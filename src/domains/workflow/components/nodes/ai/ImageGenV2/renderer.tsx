import type { NodeContentRenderer, NodeContentProps } from '../../nodeContentTypes';
import { ImageGenV2Content } from './ImageGenV2Content';

export const imageGenV2ContentRenderer: NodeContentRenderer = ({
  def,
  data,
  nodeId,
  updateNodeData,
  outerStyle,
}: NodeContentProps) => {
  const params = def?.params || [];
  return (
    <ImageGenV2Content
      params={params}
      nodeId={nodeId}
      data={data}
      outerStyle={outerStyle}
      onChange={(paramId, value) => updateNodeData(nodeId, { [paramId]: value })}
    />
  );
};
