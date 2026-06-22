import { type V2WorkflowNodeProps, V2WorkflowNodeShell } from '@/domains/workflow/components/nodes/V2WorkflowNode';
import { memo } from 'react';

function AiV3Node(props: V2WorkflowNodeProps) {
  return <V2WorkflowNodeShell {...props} type="aiV3" fallbackLabel="AI 能力 V3" fallbackColor="#0A84FF" />;
}

export default memo(AiV3Node);
