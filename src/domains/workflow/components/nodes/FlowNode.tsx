import { COLLAPSED_GROUP_INPUT_ANCHOR, COLLAPSED_GROUP_OUTPUT_ANCHOR } from '../flowCanvasRenderModel';
import {
  GRID_SIZE,
  getExpandedNodeOutputs,
  getNodeAutoExpandedSize,
  getNodeDef,
  getNodeDefaultSize,
  getNodeOutputCount,
} from '@/domains/workflow/lib/constants';
import { formatDurationSeconds } from '@/domains/workflow/lib/executionFormat';
import {
  GROUP_COLLAPSED_LAYOUT,
  GROUP_EXPANDED_LAYOUT,
  GROUP_CONTENT_INSET_BOTTOM,
  GROUP_CONTENT_INSET_X,
  enforceGroupLayout,
  getCollapsedGroupNodeSize,
  getEffectiveNodeSize,
} from '@/domains/workflow/lib/groupLayout';
import { useWorkflowStore } from '@/domains/workflow/lib/store';
import { isNodeLockedWithAncestors } from '@/domains/workflow/lib/store/editorShared';
import type { PortDef } from '@/domains/workflow/lib/types';
import { NodeAppendix } from '@/shared/ui/NodeAppendix';
import { Copy, LockOpen, LockSimple, Play, Prohibit } from '@phosphor-icons/react';
import { Handle, NodeResizer, Position, useUpdateNodeInternals } from '@xyflow/react';
import { type CSSProperties, memo, useEffect, useMemo, useState } from 'react';
import { NodeContent } from './NodeContent';
import { InputPort, OutputPort } from './NodePorts';
import { WorkflowNodeSurface, WorkflowNodeHeader, WorkflowNodeStatus } from './WorkflowNodePrimitives';
import { WorkflowGroupSurface, WorkflowGroupHeader, WorkflowNodeFrame } from './WorkflowGroupPresentation';
import { WorkflowNodeIcon } from './WorkflowNodeIcon';
import { useBufferedStringField } from './useBufferedStringField';
import './node.css';
import './nodeAnimations.css';

interface FlowNodeProps {
  id: string;
  type: string;
  data: Record<string, unknown>;
  selected: boolean;
  isConnectable: boolean;
}

function FlowNode({ id, type, data, selected, isConnectable }: FlowNodeProps) {
  const def = getNodeDef(type);
  const execStatus = useWorkflowStore((s) => s.nodeExecStatus[id] || 'idle');
  const execError = useWorkflowStore((s) => s.nodeErrors[id]);
  const execTime = useWorkflowStore((s) => s.nodeExecutionTime[id]);
  const execStartedAt = useWorkflowStore((s) => s.nodeExecutionStartedAt[id]);
  const warningMessage = useWorkflowStore((s) => s.nodeWarnings[id]);
  const nodeOutputs = useWorkflowStore((s) => s.nodeOutputs[id]);
  const edges = useWorkflowStore((s) => s.edges);
  const nodes = useWorkflowStore((s) => s.nodes);
  const updateNodeData = useWorkflowStore((s) => s.updateNodeData);
  const toggleGroupCollapsed = useWorkflowStore((s) => s.toggleGroupCollapsed);
  const setNodeSize = useWorkflowStore((s) => s.setNodeSize);
  const snapToGridEnabled = useWorkflowStore((s) => s.snapToGridEnabled);
  const toggleNodesLocked = useWorkflowStore((s) => s.toggleNodesLocked);
  const duplicateNode = useWorkflowStore((s) => s.duplicateNode);
  const executeWorkflowToNode = useWorkflowStore((s) => s.executeWorkflowToNode);
  const updateNodeInternals = useUpdateNodeInternals();

  if (!def) return <div className="p-3 text-xs">Unknown node type: {type}</div>;

  const isMergeNode = def.maxInputs !== undefined;
  const isGroupNode = type === 'group';
  const isCollapsed = isGroupNode && Boolean(data.collapsed);
  const collapsedGroupSize = isCollapsed ? getCollapsedGroupNodeSize({ data }) : null;
  const inputCount = isMergeNode ? (data.inputCount as number) || 1 : 0;
  const outputCount = def.maxOutputs ? getNodeOutputCount(type, data) : 1;
  const minSize = def.maxOutputs
    ? getNodeAutoExpandedSize(type, inputCount, outputCount)
    : getNodeDefaultSize(type, inputCount);
  const effectiveOutputs: PortDef[] = def.maxOutputs ? getExpandedNodeOutputs(type, data) : def.outputs;
  const hasOutputs = effectiveOutputs.length > 0;
  const isDisabled = Boolean(data.disabled);
  const isLocked = isNodeLockedWithAncestors(id, nodes);
  const isDirectlyLocked = Boolean(data.locked);
  const isRunning = execStatus === 'running' && !isDisabled;
  const isError = execStatus === 'error';
  const hasWarning = Boolean(warningMessage) && !isError;
  const [tick, setTick] = useState(() => Date.now());
  const currentNode = nodes.find((node) => node.id === id);
  const parentId = (currentNode as typeof currentNode & { parentId?: string })?.parentId;
  const parentGroup = parentId ? nodes.find((node) => node.id === parentId && node.type === 'group') : undefined;
  const parentGroupSize = parentGroup ? getEffectiveNodeSize(parentGroup) : null;
  const resizeMaxWidth =
    parentGroupSize && currentNode
      ? Math.max(
          minSize.w,
          Math.round((parentGroupSize.width - GROUP_CONTENT_INSET_X - currentNode.position.x) / GRID_SIZE) * GRID_SIZE,
        )
      : undefined;
  const resizeMaxHeight =
    parentGroupSize && currentNode
      ? Math.max(
          minSize.h,
          Math.round((parentGroupSize.height - GROUP_CONTENT_INSET_BOTTOM - currentNode.position.y) / GRID_SIZE) *
            GRID_SIZE,
        )
      : undefined;

  useEffect(() => {
    updateNodeInternals(id);
  }, [
    currentNode?.height,
    currentNode?.width,
    data,
    id,
    inputCount,
    isCollapsed,
    isLocked,
    parentId,
    updateNodeInternals,
  ]);

  useEffect(() => {
    if (!isRunning) return;
    const timer = window.setInterval(() => {
      setTick(Date.now());
    }, 200);
    return () => window.clearInterval(timer);
  }, [isRunning]);

  const statusText = useMemo(() => {
    if (execStatus === 'idle') return '';
    if (execStatus === 'running') {
      return formatDurationSeconds(Math.max(0, tick - (execStartedAt || tick)));
    }
    return formatDurationSeconds(execTime);
  }, [execStartedAt, execStatus, execTime, tick]);

  const effectiveInputs: PortDef[] = isMergeNode
    ? Array.from({ length: inputCount }, (_, index) => ({
        id: `item${String(index + 1)}`,
        label: String(def.inputs[0].label) + String(index + 1),
        type: def.inputs[0].type,
        required: false,
      }))
    : def.inputs;

  const connectedInputs = new Set<string>();
  for (const edge of edges) {
    if (edge.target === id && edge.targetHandle) connectedInputs.add(edge.targetHandle);
  }

  const className = [
    'flow-node',
    'group',
    selected ? 'flow-node--selected' : '',
    isGroupNode ? 'flow-node--group' : '',
    isCollapsed ? 'flow-node--collapsed' : '',
    isError ? 'flow-node--error' : '',
    hasWarning ? 'flow-node--warning' : '',
    isRunning ? 'flow-node--running' : '',
    isDisabled ? 'flow-node--disabled' : '',
    isLocked ? 'flow-node--locked' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const groupLayout = isCollapsed ? GROUP_COLLAPSED_LAYOUT : GROUP_EXPANDED_LAYOUT;
  const nodeStyle = {
    '--node-color': def.color,
    ...(isGroupNode
      ? {
          '--group-padding': `${groupLayout.padding}px`,
          '--group-gap': `${groupLayout.gap}px`,
        }
      : {}),
  } as CSSProperties;
  const groupTitleField = useBufferedStringField(String((data.title as string) || '节点组'), (nextValue) => {
    updateNodeData(id, { title: nextValue });
  });

  const NodeSurface = isGroupNode ? WorkflowGroupSurface : WorkflowNodeSurface;

  return (
    <NodeSurface
      color={def.color}
      {...(isGroupNode ? { collapsed: isCollapsed } : {})}
      status={execStatus}
      warning={hasWarning}
      disabled={isDisabled}
      locked={isLocked}
      selected={selected}
      variant={isGroupNode ? 'group' : 'standard'}
      className={className}
      style={{
        ...nodeStyle,
        width: '100%',
        height: '100%',
        minWidth: collapsedGroupSize ? collapsedGroupSize.width : minSize.w,
        minHeight: collapsedGroupSize ? collapsedGroupSize.height : minSize.h,
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
        position: 'relative',
      }}
    >
      {isCollapsed && data.showCollapsedInputAnchor === true && (
        <Handle
          id={COLLAPSED_GROUP_INPUT_ANCHOR}
          type="target"
          position={Position.Left}
          isConnectable={false}
          className="flow-node__collapsed-anchor"
          aria-hidden="true"
          style={{ left: -6 }}
        />
      )}
      {isCollapsed && data.showCollapsedOutputAnchor === true && (
        <Handle
          id={COLLAPSED_GROUP_OUTPUT_ANCHOR}
          type="source"
          position={Position.Right}
          isConnectable={false}
          className="flow-node__collapsed-anchor"
          aria-hidden="true"
          style={{ right: -6 }}
        />
      )}
      {!isGroupNode && (
        <>
          <NodeAppendix position="top" className="menu-surface">
            <div className="menu-group flow-node__toolbar-actions">
              <button
                type="button"
                className="flow-node__toolbar-action"
                onClick={(e) => {
                  e.stopPropagation();
                  updateNodeData(id, { disabled: !isDisabled });
                }}
                title={isDisabled ? '启用' : '禁用'}
                aria-label={isDisabled ? '启用' : '禁用'}
              >
                <Prohibit size={15} style={{ color: isDisabled ? 'var(--t-red)' : undefined }} />
              </button>
              <button
                type="button"
                className="flow-node__toolbar-action"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleNodesLocked([id], !isDirectlyLocked);
                }}
                title={isLocked ? '解锁' : '锁定'}
                aria-label={isLocked ? '解锁' : '锁定'}
              >
                {isLocked ? <LockSimple size={15} /> : <LockOpen size={15} />}
              </button>
              <button
                type="button"
                className="flow-node__toolbar-action"
                onClick={(e) => {
                  e.stopPropagation();
                  duplicateNode(id);
                }}
                title="复制"
                aria-label="复制"
              >
                <Copy size={15} />
              </button>
              <button
                type="button"
                className="flow-node__toolbar-action"
                onClick={(e) => {
                  e.stopPropagation();
                  executeWorkflowToNode(id);
                }}
                title="执行到此节点"
                aria-label="执行到此节点"
              >
                <Play size={15} />
              </button>
            </div>
          </NodeAppendix>
          {(isDisabled || hasWarning || execStatus !== 'idle') && (
            <NodeAppendix position="bottom" showOnHover={false}>
              <WorkflowNodeStatus
                status={execStatus}
                disabled={isDisabled}
                warning={hasWarning ? warningMessage : undefined}
                error={execError}
                duration={statusText}
              />
            </NodeAppendix>
          )}
        </>
      )}
      <NodeResizer
        isVisible={selected && !isLocked && !isCollapsed}
        minWidth={minSize.w}
        minHeight={minSize.h}
        maxWidth={resizeMaxWidth}
        maxHeight={resizeMaxHeight}
        onResizeEnd={(_, params) => {
          if (!snapToGridEnabled) return;
          const x = Math.round(params.x / GRID_SIZE) * GRID_SIZE;
          const y = Math.round(params.y / GRID_SIZE) * GRID_SIZE;
          setNodeSize(id, {
            width: Math.max(minSize.w, Math.round(params.width / GRID_SIZE) * GRID_SIZE),
            height: Math.max(minSize.h, Math.round(params.height / GRID_SIZE) * GRID_SIZE),
          });
          useWorkflowStore.setState((state) => ({
            nodes: enforceGroupLayout(
              state.nodes.map((node) => (node.id === id ? { ...node, position: { x, y } } : node)),
            ),
            hasUnsavedChanges: true,
          }));
        }}
        lineStyle={{
          borderColor: def.color,
          borderWidth: 1,
          borderStyle: 'dashed',
          opacity: 0.3,
        }}
        handleStyle={{
          width: 14,
          height: 14,
          borderRadius: 7,
          backgroundColor: def.color,
          border: '2px solid var(--color-bg-primary)',
          boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
        }}
      />
      <WorkflowNodeFrame>
        {isGroupNode ? (
          <WorkflowGroupHeader
            icon={def.icon}
            collapsed={isCollapsed}
            locked={isLocked}
            directlyLocked={isDirectlyLocked}
            onToggleLocked={() => toggleNodesLocked([id], !isDirectlyLocked)}
            onToggleCollapsed={() => toggleGroupCollapsed(id)}
            title={
              <input
                value={groupTitleField.value}
                onChange={(event) => groupTitleField.onChange(event.target.value)}
                className="flow-node__title-input nodrag"
                placeholder="节点组"
                aria-label="节点组名称"
                onFocus={() => groupTitleField.onFocus()}
                onBlur={(event) => groupTitleField.onBlur(event.target.value)}
                onCompositionStart={() => groupTitleField.onCompositionStart()}
                onCompositionEnd={(event) => groupTitleField.onCompositionEnd(event.currentTarget.value)}
                onClick={(event) => event.stopPropagation()}
                onMouseDown={(event) => event.stopPropagation()}
                onKeyDown={(event) => event.stopPropagation()}
              />
            }
          />
        ) : (
          <WorkflowNodeHeader className="flow-node__header">
            <span className="flow-node__icon">
              <WorkflowNodeIcon name={def.icon} size={15} />
            </span>
            <span className="flow-node__title">{def.label}</span>
            <button
              type="button"
              className={['flow-node__lock-button', 'nodrag', isDirectlyLocked ? 'flow-node__lock-button--active' : '']
                .filter(Boolean)
                .join(' ')}
              onClick={(event) => {
                event.stopPropagation();
                toggleNodesLocked([id], !isDirectlyLocked);
              }}
              onMouseDown={(event) => event.stopPropagation()}
              title={isDirectlyLocked ? '解锁节点' : '锁定节点'}
              aria-label={isDirectlyLocked ? '解锁节点' : '锁定节点'}
            >
              {isLocked ? <LockSimple size={14} /> : <LockOpen size={14} />}
            </button>
          </WorkflowNodeHeader>
        )}

        {!isGroupNode && effectiveInputs.length > 0 && (
          <div className="flow-node__ports flow-node__ports--inputs">
            {effectiveInputs.map((input) => (
              <InputPort
                key={input.id}
                input={input}
                connected={connectedInputs.has(input.id)}
                isConnectable={isConnectable}
                color={def.color}
              />
            ))}
          </div>
        )}

        {!isGroupNode && (
          <NodeContent
            type={type}
            data={data}
            nodeId={id}
            def={def}
            updateNodeData={updateNodeData}
            outputs={nodeOutputs}
            showBottomBorder={hasOutputs}
            connectedInputCount={connectedInputs.size}
          />
        )}

        {!isGroupNode && hasOutputs && (
          <div className="flow-node__ports flow-node__ports--outputs">
            {effectiveOutputs.map((output) => (
              <OutputPort key={output.id} output={output} isConnectable={isConnectable} color={def.color} />
            ))}
          </div>
        )}
      </WorkflowNodeFrame>
    </NodeSurface>
  );
}

export default memo(FlowNode);
