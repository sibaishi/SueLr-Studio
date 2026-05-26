import type { Colors } from '@/shared/types';

export const logLevelColor = (level: string, colors: Colors) =>
  level === 'success'
    ? colors.green
    : level === 'error'
      ? colors.red
      : level === 'warn'
        ? colors.orange
        : level === 'debug'
          ? colors.text3
          : colors.blue;

export const taskStatusColor = (status: string, colors: Colors) => {
  if (['queued', 'pending', 'submitted', 'created', '提交中'].includes(status)) return colors.orange;
  if (['processing', 'running', 'in_progress', 'in-progress', '处理中'].includes(status)) return colors.blue;
  if (['done', 'completed', 'complete', 'success', 'succeeded', 'finished', '已完成'].includes(status))
    return colors.green;
  if (['failed', 'error', 'errored', '失败'].includes(status)) return colors.red;
  return colors.text3;
};

export const taskStatusLabel = (status: string) => {
  if (['queued', 'pending', 'submitted', 'created'].includes(status)) return '排队中';
  if (['processing', 'running', 'in_progress', 'in-progress'].includes(status)) return '生成中';
  if (['done', 'completed', 'complete', 'success', 'succeeded', 'finished'].includes(status)) return '已完成';
  if (['failed', 'error', 'errored'].includes(status)) return '失败';
  if (['cancelled', 'canceled', 'aborted', '已取消'].includes(status)) return '已取消';
  return status;
};
