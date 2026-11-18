import type { NodeContentProps } from '../../nodeContentTypes';
import { AiContent } from './AiContent';

export function aiContentRenderer({ def, data, nodeId, outerStyle }: NodeContentProps) {
  if (!def) return null;
  return <AiContent params={def.params} nodeId={nodeId} data={data} outerStyle={outerStyle} onChange={() => {}} />;
}
