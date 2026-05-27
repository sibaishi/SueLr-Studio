import type { NodeContentRenderer } from '../../nodeContentTypes';
import { PromptHelperContent } from './PromptHelperContent';

export const promptHelperContentRenderer: NodeContentRenderer = ({
  data,
  nodeId,
  updateNodeData,
  outputs,
  outerStyle,
}) => (
  <PromptHelperContent
    data={data}
    nodeId={nodeId}
    updateNodeData={updateNodeData}
    outputs={outputs}
    outerStyle={outerStyle}
  />
);
