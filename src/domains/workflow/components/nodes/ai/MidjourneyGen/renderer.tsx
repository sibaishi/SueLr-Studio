import type { NodeContentProps } from '../../nodeContentTypes';
import { MidjourneyGenContent } from './MidjourneyGenContent';

export function midjourneyGenContentRenderer({ nodeId, outerStyle }: NodeContentProps) {
  return <MidjourneyGenContent nodeId={nodeId} outerStyle={outerStyle} />;
}
