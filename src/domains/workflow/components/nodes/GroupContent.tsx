import { GROUP_SAFE_MARGIN } from '@/domains/workflow/lib/groupLayout';
import type { CSSProperties } from 'react';

export function GroupNodeContent({ outerStyle, collapsed }: { outerStyle: CSSProperties; collapsed: boolean }) {
  if (collapsed) return null;

  return (
    <div
      className="node-content-shell node-content-shell--group"
      style={{
        ...outerStyle,
        padding: GROUP_SAFE_MARGIN,
      }}
    >
      <div className="node-group-content">
        Nodes inside the group stay together and can be moved, copied, disabled, deleted, or ungrouped as a unit.
      </div>
    </div>
  );
}

export function GroupContent({ outerStyle }: { outerStyle: CSSProperties }) {
  return (
    <div
      className="node-content-shell node-content-shell--group"
      style={{
        ...outerStyle,
        padding: GROUP_SAFE_MARGIN,
      }}
    >
      <div className="node-group-content">组内节点会跟随一起移动，可整体复制、禁用、删除或解组。</div>
    </div>
  );
}
