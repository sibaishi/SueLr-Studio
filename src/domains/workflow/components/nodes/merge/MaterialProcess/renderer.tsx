import type { NodeContentRenderer } from '../../nodeContentTypes';
import { MaterialProcessContent } from './MaterialProcessContent';

export const materialProcessContentRenderer: NodeContentRenderer = ({ data, nodeId, outerStyle, outputs }) => (
  <MaterialProcessContent nodeId={nodeId} data={data} outerStyle={outerStyle} outputs={outputs} />
);
