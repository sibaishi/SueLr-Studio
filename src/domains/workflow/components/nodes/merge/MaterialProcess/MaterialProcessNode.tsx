import { type V2WorkflowNodeProps, V2WorkflowNodeShell } from '@/domains/workflow/components/nodes/V2WorkflowNode';
import { memo } from 'react';

function MaterialProcessNode(props: V2WorkflowNodeProps) {
  return <V2WorkflowNodeShell {...props} type="materialProcess" fallbackLabel="素材处理" fallbackColor="#AF52DE" />;
}

export default memo(MaterialProcessNode);
