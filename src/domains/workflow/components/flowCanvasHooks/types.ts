import type { useWorkflowCanvasStore } from '@/domains/workflow/lib/store/selectors';
import type { useReactFlow } from '@xyflow/react';
import type { RefObject } from 'react';

export interface FlowHookDeps {
  store: ReturnType<typeof useWorkflowCanvasStore>;
  reactFlow: ReturnType<typeof useReactFlow>;
  containerRef?: RefObject<HTMLDivElement | null>;
}
