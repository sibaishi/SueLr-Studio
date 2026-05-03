export function getExecutionStatusLabel(isExecuting: boolean, lastExecutionStatus: 'success' | 'error' | null) {
  if (isExecuting) return '正在运行';
  if (lastExecutionStatus === 'success') return '运行成功';
  if (lastExecutionStatus === 'error') return '运行失败';
  return '暂未运行';
}

export function formatDurationSeconds(durationMs?: number | null) {
  if (typeof durationMs !== 'number' || !Number.isFinite(durationMs)) return '';
  return `${(durationMs / 1000).toFixed(2)} s`;
}
