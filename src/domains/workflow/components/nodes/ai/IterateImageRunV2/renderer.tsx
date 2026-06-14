import type { NodeContentRenderer, NodeContentProps } from '../../nodeContentTypes';
import { IterateImageRunV2Content } from './IterateImageRunV2Content';

export const iterateImageRunV2ContentRenderer: NodeContentRenderer = ({
  def,
  data,
  nodeId,
  updateNodeData,
  outerStyle,
}: NodeContentProps) => {
  const params = def?.params || [];
  return (
    <IterateImageRunV2Content
      params={params}
      nodeId={nodeId}
      data={data}
      outerStyle={outerStyle}
      onChange={(paramId, value) => updateNodeData(nodeId, { [paramId]: value })}
    />
  );
};
