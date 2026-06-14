import type { NodeRendererProps } from '@/shared/workflow/types';
import { AiChatV2Content } from './AiChatV2Content';

export function aiChatV2ContentRenderer(props: NodeRendererProps) {
  return <AiChatV2Content {...props} />;
}
