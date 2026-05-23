import { APP_VERSION } from '@/domains/workflow/lib/constants';
import { formatDurationSeconds } from '@/domains/workflow/lib/executionFormat';

interface StatusBarProps {
  nodeCount: number;
  edgeCount: number;
  isExecuting: boolean;
  executionMessage?: string | null;
  currentRunId?: string | null;
  lastExecutionStatus?: 'success' | 'error' | null;
  lastExecutionTime?: number;
  lastExecutionError?: string | null;
  lastExecutionSummary?: {
    successCount: number;
    failCount: number;
    totalDuration: number;
  } | null;
  canUndo: boolean;
  canRedo: boolean;
}

export default function StatusBar({
  nodeCount,
  edgeCount,
  isExecuting,
  executionMessage,
  currentRunId,
  lastExecutionStatus,
  lastExecutionTime,
  lastExecutionError,
  lastExecutionSummary,
  canUndo,
  canRedo,
}: StatusBarProps) {
  return (
    <div className="workflow-statusbar">
      <div className="workflow-statusbar__frame glass">
        <div className="workflow-statusbar__items">
          <StatusPill label="节点" value={String(nodeCount)} testId="workflow-node-count" />
          <StatusPill label="连线" value={String(edgeCount)} />
          <StatusPill label="撤销" value={canUndo ? '可用' : '不可用'} />
          <StatusPill label="重做" value={canRedo ? '可用' : '不可用'} />
        </div>

        <div className="workflow-statusbar__message">
          {isExecuting && (
            <span className="workflow-statusbar__tone workflow-statusbar__tone--accent">
              {executionMessage || '正在执行工作流...'}
            </span>
          )}
          {isExecuting && currentRunId && <span className="workflow-statusbar__runid">运行 ID: {currentRunId}</span>}
          {!isExecuting && lastExecutionStatus === 'success' && (
            <span className="workflow-statusbar__tone workflow-statusbar__tone--success">
              运行成功
              {lastExecutionSummary ? ` 路 ${lastExecutionSummary.successCount} 成功 / ${lastExecutionSummary.failCount} 失败` : ''}
              {lastExecutionTime ? ` 路 ${formatDurationSeconds(lastExecutionTime)}` : ''}
            </span>
          )}
          {!isExecuting && lastExecutionStatus === 'error' && (
            <span className="workflow-statusbar__tone workflow-statusbar__tone--danger" title={lastExecutionError || undefined}>
              运行失败
              {lastExecutionSummary ? ` 路 ${lastExecutionSummary.successCount} 成功 / ${lastExecutionSummary.failCount} 失败` : ''}
              {lastExecutionError ? ` 路 请检查节点配置或运行日志：${lastExecutionError}` : ''}
            </span>
          )}
          {!isExecuting && !lastExecutionStatus && <span>准备就绪，可以开始搭建、保存或执行工作流。</span>}
        </div>

        <div className="workflow-statusbar__version">Flow Studio v{APP_VERSION}</div>
      </div>
    </div>
  );
}

function StatusPill({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <div className="workflow-statusbar__pill" data-testid={testId}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
