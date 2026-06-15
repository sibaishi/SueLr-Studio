import type { NodeRendererProps } from '@/shared/workflow/types';
import { IoContent } from './IoContent';

export function ioContentRenderer(props: NodeRendererProps) {
  return <IoContent {...props} />;
}
