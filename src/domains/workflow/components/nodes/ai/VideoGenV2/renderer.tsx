import type { NodeRendererProps } from '@/shared/workflow/types';
import { VideoGenV2Content } from './VideoGenV2Content';

export function videoGenV2ContentRenderer(props: NodeRendererProps) {
  return <VideoGenV2Content {...props} />;
}
