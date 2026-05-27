import type { NodeContentRenderer } from '../../nodeContentTypes';
import { GroupNodeContent } from './GroupContent';

export const groupContentRenderer: NodeContentRenderer = ({ data, outerStyle }) => (
  <GroupNodeContent outerStyle={outerStyle} collapsed={Boolean(data.collapsed)} />
);
