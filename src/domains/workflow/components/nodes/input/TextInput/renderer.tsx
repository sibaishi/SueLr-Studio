import type { NodeContentRenderer } from '../../nodeContentTypes';
import { TextInputContent } from './TextInputContent';

export const textInputContentRenderer: NodeContentRenderer = ({ data, nodeId, updateNodeData, outerStyle }) => (
  <TextInputContent data={data} nodeId={nodeId} updateNodeData={updateNodeData} outerStyle={outerStyle} />
);
