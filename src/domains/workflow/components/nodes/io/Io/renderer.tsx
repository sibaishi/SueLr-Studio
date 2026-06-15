import type { NodeContentProps } from '../../nodeContentTypes';
import { IoContent } from './IoContent';

export function ioContentRenderer({ def, data, nodeId, outerStyle }: NodeContentProps) {
  if (!def) return null;
  return <IoContent params={def.params} nodeId={nodeId} data={data} outerStyle={outerStyle} onChange={() => {}} />;
}
