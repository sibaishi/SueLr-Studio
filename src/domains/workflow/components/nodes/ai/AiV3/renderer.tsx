import type { NodeRendererProps } from '@/shared/workflow/types';
import { AiV3Content } from './AiV3Content';

export function aiV3ContentRenderer(props: NodeRendererProps) {
  return <AiV3Content {...props} />;
}
