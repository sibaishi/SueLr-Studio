import { type V2WorkflowNodeProps, V2WorkflowNodeShell } from '@/domains/workflow/components/nodes/V2WorkflowNode';
import { memo } from 'react';

function AiNode(props: V2WorkflowNodeProps) {
  return <V2WorkflowNodeShell {...props} type="ai" fallbackLabel="AI" fallbackColor="#0A84FF" />;
}

export default memo(AiNode);
