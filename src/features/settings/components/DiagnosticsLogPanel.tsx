import { ClipboardText } from '@phosphor-icons/react';
import { useState } from 'react';
import type { LogEntry } from '@/shared/types';
import { StatusBadge, StatusNotice } from '@/ui/FeedbackPrimitives';
import { Button } from '@/ui/FormPrimitives';
import { PanelCard, PanelEmptyState } from '@/ui/PanelPrimitives';
import './diagnostics-log.css';

export function DiagnosticsLogPanel({ logs, onClear }: { logs: LogEntry[]; onClear: () => void }) {
  const [copyStatus, setCopyStatus] = useState<'success' | 'error'>();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(
        logs.map((log) => `[${log.time}] ${log.level.toUpperCase()} > ${log.msg}`).join('\n'),
      );
      setCopyStatus('success');
    } catch {
      setCopyStatus('error');
    }
  };

  return (
    <PanelCard className="diagnostics-log">
      <header className="diagnostics-log__header">
        <span>
          <ClipboardText size={14} aria-hidden="true" /> 日志
        </span>
        <div>
          <Button
            small
            variant="secondary"
            disabled={!logs.length}
            onClick={() => {
              onClear();
              setCopyStatus(undefined);
            }}
          >
            清空
          </Button>
          <Button small variant="secondary" disabled={!logs.length} onClick={() => void copy()}>
            复制全部
          </Button>
        </div>
      </header>
      {copyStatus && (
        <StatusNotice
          className="ui-status-notice--compact"
          role={copyStatus === 'error' ? 'alert' : 'status'}
          tone={copyStatus}
        >
          {copyStatus === 'success' ? '已复制全部日志。' : '无法复制日志，请检查剪贴板权限。'}
        </StatusNotice>
      )}
      <div className="diagnostics-log__entries">
        {logs.length === 0 && (
          <PanelEmptyState title="还没有日志">
            执行连接测试、导入模型或发起能力检查后，这里会显示详细反馈。
          </PanelEmptyState>
        )}
        {logs.map((log, index) => (
          <div key={index} className="diagnostics-log__entry">
            <time>{log.time}</time>
            <StatusBadge tone={log.level === 'warn' ? 'warning' : log.level}>{log.level.toUpperCase()}</StatusBadge>
            <span>{log.msg}</span>
          </div>
        ))}
      </div>
    </PanelCard>
  );
}
