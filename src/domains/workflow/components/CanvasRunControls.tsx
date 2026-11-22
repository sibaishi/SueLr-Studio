import { Play, Stop } from '@phosphor-icons/react';
import { ActionButton, ToolGroup } from '@/ui/CanvasPrimitives';

interface CanvasRunControlsProps {
  isExecuting: boolean;
  onExecute: () => void;
  onCancelExecution: () => void;
  className?: string;
}

export default function CanvasRunControls({
  isExecuting,
  onExecute,
  onCancelExecution,
  className,
}: CanvasRunControlsProps) {
  return (
    <ToolGroup label="工作流执行" className={className}>
      <ActionButton onClick={onExecute} disabled={isExecuting} data-testid="workflow-execute">
        <Play size={14} weight="fill" aria-hidden="true" />
        执行
      </ActionButton>
      <ActionButton
        intent="danger"
        onClick={onCancelExecution}
        disabled={!isExecuting}
        data-testid="workflow-cancel-execution"
      >
        <Stop size={13} weight="fill" aria-hidden="true" />
        停止
      </ActionButton>
    </ToolGroup>
  );
}
