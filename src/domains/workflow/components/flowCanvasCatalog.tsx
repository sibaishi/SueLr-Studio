import type { NODE_REGISTRY } from '@/domains/workflow/lib/constants';
import { FLOW_DISABLED_NODE_REASON } from './flowCanvasConfig';
import { NODE_ICONS } from './nodes/nodeConstants';

export function ContextMenuButton({
  label,
  onClick,
  danger = false,
  active = false,
  disabled = false,
  onHover,
  title,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  active?: boolean;
  disabled?: boolean;
  onHover?: () => void;
  title?: string;
}) {
  return (
    <button
      onClick={() => {
        if (disabled) return;
        onClick();
      }}
      disabled={disabled}
      className={[
        'workflow-context-menu__item',
        danger ? 'workflow-context-menu__item--danger' : '',
        active ? 'workflow-context-menu__item--active' : '',
        disabled ? 'workflow-context-menu__item--disabled' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onMouseEnter={() => {
        if (!disabled) onHover?.();
      }}
      title={title || (disabled ? FLOW_DISABLED_NODE_REASON : label)}
    >
      {label}
    </button>
  );
}

export function NodeCatalogButton({
  nodeDef,
  onClick,
}: {
  nodeDef: (typeof NODE_REGISTRY)[number];
  onClick: () => void;
}) {
  const Icon = NODE_ICONS[nodeDef.icon] || NODE_ICONS.eye;
  const inputCount = nodeDef.maxInputs ? `${nodeDef.maxInputs}+` : String(nodeDef.inputs.length);
  const outputCount = String(nodeDef.outputs.length);

  return (
    <button
      type="button"
      className="workflow-context-menu__node-card"
      data-testid={`workflow-node-catalog-item-${nodeDef.type}`}
      onClick={onClick}
      title={nodeDef.label}
    >
      <span
        className="workflow-context-menu__node-icon"
        style={{
          color: nodeDef.color || '#8E8E93',
          background: `${nodeDef.color || '#8E8E93'}18`,
          border: `1px solid ${nodeDef.color || '#8E8E93'}28`,
        }}
        aria-hidden="true"
      >
        <Icon size={16} strokeWidth={2.1} />
      </span>
      <span className="workflow-context-menu__node-copy">
        <span className="workflow-context-menu__node-label">{nodeDef.label}</span>
        <span className="workflow-context-menu__node-meta">
          {inputCount} 入 / {outputCount} 出
        </span>
      </span>
    </button>
  );
}
