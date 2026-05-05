import React from 'react';
import { ClipboardList } from 'lucide-react';
import { useT } from '@/contexts/ThemeContext';
import type { LogEntry } from '@/lib/types';
import { glass } from './glass';
import { CollapsibleSection } from './CollapsibleSection';

function EmptyLogState() {
  const T = useT();

  return (
    <div style={{ color: T.text3, textAlign: 'center', padding: '18px 10px', lineHeight: 1.6 }}>
      <div style={{ color: 'var(--color-text-primary)', fontSize: 13, fontWeight: 700 }}>还没有日志</div>
      <div style={{ marginTop: 6 }}>执行连接测试、导入模型或发起能力检查后，这里会显示详细反馈。</div>
    </div>
  );
}

export function LogPanel({
  logs,
  onClear,
  collapsible = false,
  style = {},
}: {
  logs: LogEntry[];
  onClear: () => void;
  collapsible?: boolean;
  style?: React.CSSProperties;
}) {
  const T = useT();

  const copyLogs = () => {
    void navigator.clipboard.writeText(logs.map((log) => `[${log.time}] ${log.level.toUpperCase()} > ${log.msg}`).join('\n'));
  };

  const logContent = (
    <div
      style={{
        flex: 1,
        overflowY: 'auto',
        ...glass(0.02),
        padding: 12,
        fontFamily: 'monospace',
        fontSize: 11,
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
      }}
    >
      {logs.length === 0 && <EmptyLogState />}
      {logs.map((log, index) => (
        <div key={index} style={{ display: 'flex', gap: 6 }}>
          <span style={{ color: T.text3, flexShrink: 0 }}>[{log.time}]</span>
          <span
            style={{
              color:
                log.level === 'success'
                  ? T.green
                  : log.level === 'error'
                    ? T.red
                    : log.level === 'warn'
                      ? T.orange
                      : log.level === 'debug'
                        ? T.text3
                        : T.blue,
              fontWeight: 600,
              flexShrink: 0,
            }}
          >
            {log.level.toUpperCase()}
          </span>
          <span style={{ color: T.text2, wordBreak: 'break-all' }}>{log.msg}</span>
        </div>
      ))}
    </div>
  );

  if (collapsible) {
    return (
      <CollapsibleSection title="日志" count={logs.length} defaultOpen={false}>
        <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
          <button onClick={onClear} style={{ background: 'none', border: 'none', color: T.text3, fontSize: 11, cursor: 'pointer' }}>
            清空
          </button>
          <button onClick={copyLogs} style={{ background: 'none', border: 'none', color: T.blue, fontSize: 11, cursor: 'pointer' }}>
            复制
          </button>
        </div>
        {logContent}
      </CollapsibleSection>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', ...style }}>
      <div
        style={{
          padding: '10px 16px',
          borderBottom: `1px solid ${T.border}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 13, color: T.text2, display: 'flex', alignItems: 'center', gap: 6 }}>
          <ClipboardList size={14} /> 日志
        </span>
        <div style={{ display: 'flex', gap: 12 }}>
          <button onClick={onClear} style={{ background: 'none', border: 'none', color: T.text3, fontSize: 11, cursor: 'pointer' }}>
            清空
          </button>
          <button onClick={copyLogs} style={{ background: 'none', border: 'none', color: T.blue, fontSize: 11, cursor: 'pointer' }}>
            复制全部
          </button>
        </div>
      </div>
      {logContent}
    </div>
  );
}
