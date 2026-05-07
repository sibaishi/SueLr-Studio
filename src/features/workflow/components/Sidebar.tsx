import { useMemo, useState, type DragEvent } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { NODE_ICONS } from '@/features/workflow/components/nodes/nodeConstants';
import { NODE_CATEGORIES, NODE_REGISTRY } from '@/features/workflow/lib/constants';
import type { NodeTypeDef } from '@/features/workflow/lib/types';

const DISABLED_NEW_NODE_TYPES = new Set(['videoGen', 'videoInput', 'audioInput', 'videoMerge', 'audioMerge', 'universalMerge']);
const DISABLED_NODE_REASON = '暂时停用，无法新建';

const CATEGORY_ACCENTS: Record<string, string> = {
  input: '#0A84FF',
  api: '#5856D6',
  merge: '#8E8E93',
  ai: '#BF5AF2',
  output: '#30D158',
};

interface SidebarProps {
  onAddNode: (nodeType: NodeTypeDef) => void;
}

export default function Sidebar({ onAddNode }: SidebarProps) {
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [keyword, setKeyword] = useState('');

  const handleDragStart = (event: DragEvent, nodeType: string) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  const normalizedKeyword = keyword.trim().toLowerCase();
  const filteredRegistry = useMemo(() => {
    if (!normalizedKeyword) return NODE_REGISTRY;
    return NODE_REGISTRY.filter((node) => {
      return node.label.toLowerCase().includes(normalizedKeyword) || node.type.toLowerCase().includes(normalizedKeyword);
    });
  }, [normalizedKeyword]);

  return (
    <aside className="workflow-panel workflow-sidebar glass">
      <div className="workflow-panel__header">
        <div>
          <div className="workflow-panel__eyebrow">节点资源</div>
          <div className="workflow-panel__title">节点库</div>
          <div className="workflow-panel__desc">拖进画布，像搭积木一样组织你的流程。</div>
        </div>
      </div>

      <div className="workflow-sidebar__search">
        <Search size={14} />
        <input
          data-testid="workflow-node-search"
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          placeholder="搜索节点"
          aria-label="搜索节点"
        />
      </div>

      <div className="workflow-panel__body workflow-sidebar__body">
        {NODE_CATEGORIES.map((category) => {
          const nodes = filteredRegistry.filter((node) => node.category === category.id && node.type !== 'universalMerge');
          if (nodes.length === 0) return null;

          const collapsed = Boolean(collapsedGroups[category.id]);

          return (
            <section key={category.id} className="workflow-sidebar__section">
              <button
                type="button"
                onClick={() =>
                  setCollapsedGroups((state) => ({
                    ...state,
                    [category.id]: !state[category.id],
                  }))
                }
                className="workflow-sidebar__section-header"
              >
                <span className="workflow-sidebar__section-title">
                  <span
                    className="workflow-sidebar__section-dot"
                    style={{ background: CATEGORY_ACCENTS[category.id] || 'var(--color-accent)' }}
                  />
                  {category.label}
                </span>
                <span className="workflow-sidebar__section-meta">
                  {nodes.length}
                  <ChevronDown size={14} style={{ transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }} />
                </span>
              </button>

              {!collapsed && (
                <div className="workflow-sidebar__list">
                  {nodes.map((nodeType) => (
                    <NodeItem
                      key={nodeType.type}
                      nodeType={nodeType}
                      disabled={DISABLED_NEW_NODE_TYPES.has(nodeType.type)}
                      disabledReason={DISABLED_NEW_NODE_TYPES.has(nodeType.type) ? DISABLED_NODE_REASON : ''}
                      onClick={() => onAddNode(nodeType)}
                      onDragStart={(event) => handleDragStart(event, nodeType.type)}
                    />
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>

      <div className="workflow-panel__footer">点击可快速添加，拖拽可精确放到指定位置。</div>
    </aside>
  );
}

function NodeItem({
  nodeType,
  disabled,
  disabledReason,
  onClick,
  onDragStart,
}: {
  nodeType: NodeTypeDef;
  disabled: boolean;
  disabledReason?: string;
  onClick: () => void;
  onDragStart: (event: DragEvent) => void;
}) {
  const Icon = NODE_ICONS[nodeType.icon] || NODE_ICONS.eye;

  return (
    <div
      data-testid={`workflow-node-item-${nodeType.type}`}
      draggable={!disabled}
      onDragStart={(event) => {
        if (disabled) {
          event.preventDefault();
          return;
        }
        onDragStart(event);
      }}
      onClick={() => {
        if (disabled) return;
        onClick();
      }}
      className="workflow-node-item"
      title={disabledReason || nodeType.label}
      style={{ opacity: disabled ? 0.5 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}
    >
      <span
        className="workflow-node-item__icon"
        style={{ color: nodeType.color, background: `${nodeType.color}18`, border: `1px solid ${nodeType.color}28` }}
      >
        <Icon size={16} strokeWidth={2.1} />
      </span>

      <div className="min-w-0 flex-1">
        <div className="workflow-node-item__name">{nodeType.label}</div>
        <div className="workflow-node-item__meta">
          {nodeType.inputs.length > 0 && <span>入 {nodeType.inputs.length}</span>}
          {nodeType.outputs.length > 0 && <span>出 {nodeType.outputs.length}</span>}
          {nodeType.inputs.length === 0 && nodeType.outputs.length === 0 && <span>终端节点</span>}
          {disabled && <span>{disabledReason}</span>}
        </div>
      </div>
    </div>
  );
}
