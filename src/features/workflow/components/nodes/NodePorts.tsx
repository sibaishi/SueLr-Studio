import { Handle, Position } from '@xyflow/react';
import type { CSSProperties } from 'react';
import type { PortDef } from '@/features/workflow/lib/types';
import {
  NODE_PORT_GUTTER,
  PORT_TYPE_COLORS,
  PORT_TYPE_LABELS,
} from './nodeConstants';

export function InputPort({
  input,
  connected,
  isConnectable,
  color,
}: {
  input: PortDef;
  connected: boolean;
  isConnectable: boolean;
  color: string;
}) {
  const portColor = PORT_TYPE_COLORS[input.type] || color || '#8E8E93';

  return (
    <div
      className={['node-port', 'node-port--input', connected ? 'node-port--connected' : ''].filter(Boolean).join(' ')}
      title={connected ? '已连接' : undefined}
      style={{ '--port-color': portColor } as CSSProperties}
    >
      <Handle
        type="target"
        position={Position.Left}
        id={input.id}
        isConnectable={isConnectable}
        style={{
          background: portColor,
          left: NODE_PORT_GUTTER,
          top: '50%',
          transform: 'translateY(-50%)',
        }}
      />
      <span className="node-port__label">
        {input.label}
      </span>
      {input.required && <span className="node-port__required">*</span>}
      <span className="node-port__type">
        {PORT_TYPE_LABELS[input.type] || input.type}
      </span>
    </div>
  );
}

export function OutputPort({ output, isConnectable, color }: { output: PortDef; isConnectable: boolean; color: string }) {
  const portColor = PORT_TYPE_COLORS[output.type] || color || '#8E8E93';

  return (
    <div
      className="node-port node-port--output"
      style={{ '--port-color': portColor } as CSSProperties}
    >
      <span className="node-port__type">
        {PORT_TYPE_LABELS[output.type] || output.type}
      </span>
      <span className="node-port__label">
        {output.label}
      </span>
      <Handle
        type="source"
        position={Position.Right}
        id={output.id}
        isConnectable={isConnectable}
        style={{
          background: portColor,
          right: NODE_PORT_GUTTER,
          top: '50%',
          transform: 'translateY(-50%)',
        }}
      />
    </div>
  );
}
