import type { NodeContentRenderer, NodeContentProps } from '../../nodeContentTypes';
import { IterateRunV2Content } from './IterateRunV2Content';

export const iterateRunV2ContentRenderer: NodeContentRenderer = ({
  def,
  data,
  nodeId,
  updateNodeData,
  outerStyle,
}: NodeContentProps) => {
  const params = def?.params || [];
  return (
    <IterateRunV2Content
      params={params}
      nodeId={nodeId}
      data={data}
      outerStyle={outerStyle}
      onChange={(paramId, value) => updateNodeData(nodeId, { [paramId]: value })}
    />
  );
};
