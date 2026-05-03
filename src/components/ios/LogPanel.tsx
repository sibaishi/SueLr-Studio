import React from 'react';
import { ClipboardList } from 'lucide-react';
import { useT } from '../../contexts/ThemeContext';
import type { LogEntry } from '../../lib/types';
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

export function LogPanel({ logs, onClear, collapsible = false, style = {} }: { logs: LogEntry[]; onClear: () => void; collapsible?: boolean; style?: React.CSSProperties }) {
  const T = useT();
  const copyLogs = () => { navigator.clipboard.writeText(logs.map(l => `[${l.time}] ${l.level.toUpperCase()} > ${l.msg}`).join('\n')); };
  const logContent = (
    <div style={{ flex: 1, overflowY: 'auto', ...glass(0.02), padding: 12, fontFamily: 'monospace', fontSize: 11, display: 'flex', flexDirection: 'column', gap: 2 }}>
      {logs.length === 0 && <EmptyLogState />}
      {logs.map((l, i) => (
        <div key={i} style={{ display: 'flex', gap: 6 }}>
          <span style={{ color: T.text3, flexShrink: 0 }}>[{l.time}]</span>
          <span style={{ color: l.level === 'success' ? T.green : l.level === 'error' ? T.red : l.level === 'warn' ? T.orange : l.level === 'debug' ? T.text3 : T.blue, fontWeight: 600, flexShrink: 0 }}>{l.level.toUpperCase()}</span>
          <span style={{ color: T.text2, wordBreak: 'break-all' }}>{l.msg}</span>
        </div>
      ))}
    </div>
  );
  if (collapsible) {
    return (
      <CollapsibleSection title="日志" count={logs.length} defaultOpen={false}>
        <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
          <button onClick={onClear} style={{ background: 'none', border: 'none', color: T.text3, fontSize: 11, cursor: 'pointer' }}>清空</button>
          <button onClick={copyLogs} style={{ background: 'none', border: 'none', color: T.blue, fontSize: 11, cursor: 'pointer' }}>复制</button>
        </div>
        {logContent}
      </CollapsibleSection>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', ...style }}>
      <div style={{ padding: '10px 16px', borderBottom: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <span style={{ fontSize: 13, color: T.text2, display: 'flex', alignItems: 'center', gap: 6 }}><ClipboardList size={14} /> 日志</span>
        <div style={{ display: 'flex', gap: 12 }}>
          <button onClick={onClear} style={{ background: 'none', border: 'none', color: T.text3, fontSize: 11, cursor: 'pointer' }}>清空</button>
          <button onClick={copyLogs} style={{ background: 'none', border: 'none', color: T.blue, fontSize: 11, cursor: 'pointer' }}>复制全部</button>
        </div>
      </div>
      {logContent}
    </div>
  );
}
