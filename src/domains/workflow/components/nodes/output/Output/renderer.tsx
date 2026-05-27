import type { NodeContentRenderer } from '../../nodeContentTypes';
import { OutputContent } from './OutputContent';

export const outputContentRenderer: NodeContentRenderer = ({ outputs, outerStyle, showBottomBorder }) => (
  <OutputContent outputs={outputs} outerStyle={outerStyle} isLastSection={!showBottomBorder} />
);
