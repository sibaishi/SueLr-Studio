import type { NodeContentRenderer } from '../../nodeContentTypes';
import { ImageCompareContent } from './ImageCompareContent';

export const imageCompareContentRenderer: NodeContentRenderer = ({ outputs, outerStyle }) => (
  <ImageCompareContent outputs={outputs} outerStyle={outerStyle} />
);
