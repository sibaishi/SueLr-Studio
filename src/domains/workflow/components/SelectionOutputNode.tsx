import { type NodeProps, Position } from '@xyflow/react';
import { WorkflowNodeHandle } from './nodes/WorkflowNodePrimitives';

/** Render-only selection frame: never saved or sent to the executor. */
export function SelectionOutputNode({ data }: NodeProps) {
  return (
    <div className="workflow-selection-output nodrag" aria-label={`已选中 ${String(data.count)} 个节点`}>
      <WorkflowNodeHandle
        type="source"
        position={Position.Right}
        id="output"
        aria-label="多选总输出端口"
        title="拖动连接所有选中节点"
        style={{ right: -6, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'all' }}
      />
    </div>
  );
}
