import { Handle, Position } from '@xyflow/react';
import type { CSSProperties } from 'react';
import {
  buildGroupHandleId,
  isGroupPortEmpty,
  isGroupPortExternallyConnectable,
  type GroupPort,
} from '@/domains/workflow/lib/groupPorts';
import type { PortDef } from '@/domains/workflow/lib/types';
import {
  NODE_PORT_GUTTER,
  PORT_TYPE_COLORS,
  PORT_TYPE_LABELS,
} from './nodeConstants';

function getPortColor(type: string, fallback: string) {
  return PORT_TYPE_COLORS[type] || fallback || '#8E8E93';
}

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
  const portColor = getPortColor(input.type, color);

  return (
    <div
      className={['node-port', 'node-port--input', connected ? 'node-port--connected' : ''].filter(Boolean).join(' ')}
      title={connected ? 'Connected' : undefined}
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

export function OutputPort({
  output,
  isConnectable,
  color,
}: {
  output: PortDef;
  isConnectable: boolean;
  color: string;
}) {
  const portColor = getPortColor(output.type, color);

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

function GroupHandle({
  side,
  role,
  portId,
  handleType,
  position,
  visualPosition,
  visualOffset,
  connectable,
  color,
  className,
}: {
  side: 'input' | 'output';
  role: 'external' | 'internal';
  portId: string;
  handleType: 'source' | 'target';
  position: Position;
  visualPosition?: Position;
  visualOffset?: number;
  connectable: boolean;
  color: string;
  className: string;
}) {
  const handleVisualPosition = visualPosition || position;
  const sideStyle = handleVisualPosition === Position.Left
    ? {
        left: visualOffset ?? NODE_PORT_GUTTER,
        right: 'auto',
        top: '50%',
        transform: 'translateY(-50%)',
      }
    : {
        left: 'auto',
        right: visualOffset ?? NODE_PORT_GUTTER,
        top: '50%',
        transform: 'translateY(-50%)',
      };

  return (
    <Handle
      type={handleType}
      position={position}
      id={buildGroupHandleId(side, portId, role)}
      isConnectable={connectable}
      className={className}
      style={{
        background: color,
        ...sideStyle,
      }}
    />
  );
}

export function GroupPortRow({
  side,
  port,
  color,
  isConnectable,
}: {
  side: 'input' | 'output';
  port: GroupPort;
  color: string;
  isConnectable: boolean;
}) {
  const portType = port.type || 'any';
  const portColor = getPortColor(portType, color);
  const isEmpty = isGroupPortEmpty(port);
  const portText = isEmpty ? 'EMPTY' : (PORT_TYPE_LABELS[portType] || portType);

  return (
    <div
      className={[
        'node-port',
        'node-port--group',
        side === 'input' ? 'node-port--group-input' : 'node-port--group-output',
        isEmpty ? 'node-port--group-empty' : '',
      ].filter(Boolean).join(' ')}
      style={{ '--port-color': portColor } as CSSProperties}
    >
      {side === 'input' ? (
        <>
          <GroupHandle
            side="input"
            role="external"
            portId={port.id}
            handleType="target"
            position={Position.Left}
            connectable={isGroupPortExternallyConnectable(port) && isConnectable}
            color={portColor}
            className="node-port__handle node-port__handle--shared"
          />
          <GroupHandle
            side="input"
            role="internal"
            portId={port.id}
            handleType="source"
            position={Position.Right}
            visualPosition={Position.Left}
            visualOffset={98}
            connectable={isConnectable}
            color={portColor}
            className="node-port__handle node-port__handle--shared node-port__handle--internal"
          />
          <div className="node-port__group-main">
            {isEmpty ? (
              <span className="node-port__placeholder">
                {portText}
              </span>
            ) : (
              <span className="node-port__type">
                {portText}
              </span>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="node-port__group-main">
            {isEmpty ? (
              <span className="node-port__placeholder">
                {portText}
              </span>
            ) : (
              <span className="node-port__type">
                {portText}
              </span>
            )}
          </div>
          <GroupHandle
            side="output"
            role="external"
            portId={port.id}
            handleType="source"
            position={Position.Right}
            connectable={isGroupPortExternallyConnectable(port) && isConnectable}
            color={portColor}
            className="node-port__handle node-port__handle--shared"
          />
          <GroupHandle
            side="output"
            role="internal"
            portId={port.id}
            handleType="target"
            position={Position.Left}
            visualPosition={Position.Right}
            visualOffset={98}
            connectable={port.insideLinks.length === 0 && isConnectable}
            color={portColor}
            className="node-port__handle node-port__handle--shared node-port__handle--internal"
          />
        </>
      )}
    </div>
  );
}
