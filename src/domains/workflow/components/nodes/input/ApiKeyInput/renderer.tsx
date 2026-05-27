import type { NodeContentRenderer } from '../../nodeContentTypes';
import { ApiKeyContent } from './ApiKeyContent';

export const apiKeyInputContentRenderer: NodeContentRenderer = ({ data, nodeId, updateNodeData, outerStyle }) => (
  <ApiKeyContent data={data} nodeId={nodeId} updateNodeData={updateNodeData} outerStyle={outerStyle} />
);
