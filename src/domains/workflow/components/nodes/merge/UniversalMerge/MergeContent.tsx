import type { CSSProperties } from 'react';

export function MergeContent({
  connectedCount,
  maxInputs,
  outerStyle,
  note,
}: {
  connectedCount: number;
  maxInputs: number;
  outerStyle: CSSProperties;
  note?: string;
}) {
  return (
    <div
      className="node-content-shell node-merge-content"
      style={{
        ...outerStyle,
        overflow: 'visible',
      }}
    >
      <span className="node-merge-count">
        已连接 {connectedCount} / {maxInputs}
      </span>
      <span className="node-merge-note">{note || '按端口顺序合并为一组'}</span>
    </div>
  );
}
