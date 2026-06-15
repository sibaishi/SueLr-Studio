import type { NodeContentProps } from '../../nodeContentTypes';
import { AiV3Content } from './AiV3Content';

export function aiV3ContentRenderer({ def, data, nodeId, outerStyle }: NodeContentProps) {
  if (!def) return null;
  return <AiV3Content params={def.params} nodeId={nodeId} data={data} outerStyle={outerStyle} onChange={() => {}} />;
}
