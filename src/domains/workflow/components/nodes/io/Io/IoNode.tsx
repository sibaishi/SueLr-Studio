import { type V2WorkflowNodeProps, V2WorkflowNodeShell } from '@/domains/workflow/components/nodes/V2WorkflowNode';
import { memo } from 'react';

function IoNode(props: V2WorkflowNodeProps) {
  return <V2WorkflowNodeShell {...props} type="io" fallbackLabel="IO" fallbackColor="#5E5CE6" />;
}

export default memo(IoNode);
