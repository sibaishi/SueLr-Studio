import type { NodeContentRenderer } from '../../nodeContentTypes';
import { PromptHelperContent } from './PromptHelperContent';

export const promptHelperContentRenderer: NodeContentRenderer = ({
  data,
  nodeId,
  updateNodeData,
  outerStyle,
}) => (
  <PromptHelperContent
    data={data}
    nodeId={nodeId}
    updateNodeData={updateNodeData}
    outerStyle={outerStyle}
  />
);
