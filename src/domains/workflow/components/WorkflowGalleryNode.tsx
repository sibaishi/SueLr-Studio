import { createContext, useContext } from 'react';
import { useReactFlow, type Node, type NodeProps } from '@xyflow/react';
import { Robot, Stack } from '@phosphor-icons/react';
import { getNodeDef } from '@/domains/workflow/lib/constants';
import { WorkflowCardPresentation, WorkflowCardToolbar } from './nodes/WorkflowCardPresentation';
import type { WorkflowNodeVisualState } from './nodes/WorkflowNodePrimitives';
import { WorkflowGroupSurface, WorkflowGroupHeader, WorkflowNodeFrame } from './nodes/WorkflowGroupPresentation';
import {
  NodeContentSurface,
  NodeContentFrame,
  NodeEmptyState,
  NodeImagePreview,
  NodeMediaPreview,
  NodeTextPreview,
} from './nodes/WorkflowContentPrimitives';
import { WorkflowNodeIcon } from './nodes/WorkflowNodeIcon';

export const galleryImage = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="280" viewBox="0 0 400 280"><rect width="400" height="280" fill="#2563eb"/><circle cx="300" cy="64" r="32" fill="#e0e7ff"/><path d="M0 280 140 64 300 280 M180 280 300 120 440 280" fill="#8b5cf6"/></svg>')}`;
export type GalleryContent = 'empty' | 'text' | 'image' | 'audio' | 'video';
export type GalleryData = Record<string, unknown> &
  WorkflowNodeVisualState & {
    kind: 'ai' | 'io' | 'group';
    title: string;
    content: GalleryContent;
    text: string;
    collapsed?: boolean;
  };
export type GalleryNode = Node<GalleryData, 'gallery'>;
export const GalleryActions = createContext({
  notify: (_message: string) => {},
  preview: (_data: GalleryData) => {},
  collapse: (_id: string) => {},
  duplicate: (_id: string) => {},
});

/** Isolated fixture adapter around the production presentation components. */
function GalleryNodeView({ id, data, selected, isConnectable }: NodeProps<GalleryNode>) {
  const { updateNodeData } = useReactFlow<GalleryNode>();
  const actions = useContext(GalleryActions);
  const def = getNodeDef(data.kind)!;
  const toggleLock = () => updateNodeData(id, { locked: !data.locked });
  if (data.kind === 'group')
    return (
      <WorkflowGroupSurface
        color={def.color}
        collapsed={data.collapsed}
        selected={selected}
        locked={data.locked}
        style={{ width: '100%', height: '100%' }}
      >
        <WorkflowNodeFrame>
          <WorkflowGroupHeader
            icon={def.icon}
            collapsed={Boolean(data.collapsed)}
            locked={Boolean(data.locked)}
            directlyLocked={Boolean(data.locked)}
            onToggleLocked={toggleLock}
            onToggleCollapsed={() => actions.collapse(id)}
            title={
              <input
                className="flow-node__title-input nodrag"
                aria-label="节点组名称"
                value={data.title}
                onChange={(event) => updateNodeData(id, { title: event.target.value })}
                onKeyDown={(event) => event.stopPropagation()}
              />
            }
          />
        </WorkflowNodeFrame>
      </WorkflowGroupSurface>
    );
  return (
    <WorkflowCardPresentation
      color={def.color}
      selected={selected}
      locked={data.locked}
      disabled={data.disabled}
      status={data.status}
      warning={data.warning ? '请检查输入参数' : undefined}
      error={data.status === 'error' ? '演示错误：请检查模型与输入' : undefined}
      duration="1.2s"
      isConnectable={isConnectable}
      style={{ width: '100%', height: '100%' }}
      toolbar={
        <WorkflowCardToolbar
          disabled={data.disabled}
          locked={data.locked}
          onToggleDisabled={() => updateNodeData(id, { disabled: !data.disabled })}
          onToggleLocked={toggleLock}
          onDuplicate={() => actions.duplicate(id)}
          onExecute={() => {
            updateNodeData(id, { status: 'running' });
            actions.notify('节点运行状态演示，不调用模型。');
          }}
        >
          <button
            type="button"
            className="node-v2-appendix-label nodrag"
            title="选择节点并编辑标题"
            onClick={() => actions.notify('可在右侧检查面板编辑标题。')}
          >
            <span className="node-v2-appendix-type-icon" style={{ color: def.color }}>
              <WorkflowNodeIcon name={def.icon} size={14} />
            </span>
            <span className="node-v2-appendix-label-text">{data.title}</span>
          </button>
        </WorkflowCardToolbar>
      }
    >
      <NodeContentSurface>
        <NodeContentFrame layout={data.content === 'text' ? 'text' : 'preview'}>
          {data.content === 'empty' && (
            <NodeEmptyState
              icon={data.kind === 'ai' ? <Robot size={32} weight="light" /> : <Stack size={32} weight="light" />}
            >
              {data.kind === 'ai' ? '待生成' : '待输入'}
            </NodeEmptyState>
          )}
          {data.content === 'text' && (
            <NodeTextPreview onPreview={() => actions.preview(data)}>{data.text || '请输入文本'}</NodeTextPreview>
          )}
          {data.content === 'image' && (
            <NodeImagePreview src={galleryImage} alt={data.title} onPreview={() => actions.preview(data)} />
          )}
          {data.content === 'audio' && <NodeMediaPreview kind="audio" src="" />}
          {data.content === 'video' && <NodeMediaPreview kind="video" src="" fill />}
        </NodeContentFrame>
      </NodeContentSurface>
    </WorkflowCardPresentation>
  );
}
export const galleryNodeTypes = { gallery: GalleryNodeView };
