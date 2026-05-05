import { memo, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Lock, Unlock } from 'lucide-react';
import { NodeResizer, useUpdateNodeInternals } from '@xyflow/react';
import { getNodeDefaultSize, getNodeDef, GRID_SIZE } from '@/features/workflow/lib/constants';
import {
  GROUP_HEADER_HEIGHT,
  GROUP_SAFE_MARGIN,
  enforceGroupLayout,
  getEffectiveNodeSize,
} from '@/features/workflow/lib/groupLayout';
import { useWorkflowStore } from '@/features/workflow/lib/store';
import { isNodeLockedWithAncestors } from '@/features/workflow/lib/store/editorShared';
import type { PortDef } from '@/features/workflow/lib/types';
import { formatDurationSeconds } from '@/features/workflow/lib/executionFormat';
import { NodeContent } from './NodeContent';
import { InputPort, OutputPort } from './NodePorts';
import { NODE_ICONS, STATUS_BADGE } from './nodeConstants';
import { useBufferedStringField } from './useBufferedStringField';
import './node.css';

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
  const setNodeSize = useWorkflowStore((s) => s.setNodeSize);
  const snapToGridEnabled = useWorkflowStore((s) => s.snapToGridEnabled);
  const toggleNodesLocked = useWorkflowStore((s) => s.toggleNodesLocked);
  const updateNodeInternals = useUpdateNodeInternals();

  if (!def) return <div className="p-3 text-xs">未知节点类型: {type}</div>;

  const isMergeNode = def.maxInputs !== undefined;
  const isGroupNode = type === 'group';
  const inputCount = isMergeNode ? ((data.inputCount as number) || 1) : 0;
  const minSize = getNodeDefaultSize(type, inputCount);
  const Icon = NODE_ICONS[def.icon] || NODE_ICONS.eye;
  const hasOutputs = def.outputs.length > 0;
  const isDisabled = Boolean(data.disabled);
  const isLocked = isNodeLockedWithAncestors(id, nodes);
  const isDirectlyLocked = Boolean(data.locked);
  const hasGeneratedMask = type === 'imageInput' && Boolean(data.maskFileUrl || data.maskPreviewUrl);
  const isRunning = execStatus === 'running' && !isDisabled;
  const isError = execStatus === 'error';
  const hasWarning = Boolean(warningMessage) && !isError;
  const badge = STATUS_BADGE[execStatus];
  const [tick, setTick] = useState(() => Date.now());
  const currentNode = nodes.find((node) => node.id === id);
  const parentId = (currentNode as (typeof currentNode) & { parentId?: string })?.parentId;
  const parentGroup = parentId ? nodes.find((node) => node.id === parentId && node.type === 'group') : undefined;
  const parentGroupSize = parentGroup ? getEffectiveNodeSize(parentGroup) : null;
  const resizeMaxWidth = parentGroupSize && currentNode
    ? Math.max(
        minSize.w,
        Math.round((parentGroupSize.width - GROUP_SAFE_MARGIN - currentNode.position.x) / GRID_SIZE) * GRID_SIZE,
      )
    : undefined;
  const resizeMaxHeight = parentGroupSize && currentNode
    ? Math.max(
        minSize.h,
        Math.round((parentGroupSize.height - GROUP_SAFE_MARGIN - currentNode.position.y) / GRID_SIZE) * GRID_SIZE,
      )
    : undefined;

  useEffect(() => {
    updateNodeInternals(id);
  }, [id, inputCount, updateNodeInternals]);

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
        id: 'item' + String(index + 1),
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
    selected ? 'flow-node--selected' : '',
    isGroupNode ? 'flow-node--group' : '',
    isError ? 'flow-node--error' : '',
    hasWarning ? 'flow-node--warning' : '',
    isRunning ? 'flow-node--running' : '',
    isDisabled ? 'flow-node--disabled' : '',
    isLocked ? 'flow-node--locked' : '',
  ].filter(Boolean).join(' ');
  const nodeStyle = {
    '--node-color': def.color,
  } as CSSProperties;
  const groupTitleField = useBufferedStringField(String((data.title as string) || '节点组'), (nextValue) => {
    updateNodeData(id, { title: nextValue });
  });

  return (
    <div
      className={className}
      style={{
        ...nodeStyle,
        width: '100%',
        height: '100%',
        minWidth: minSize.w,
        minHeight: minSize.h,
        animation: isRunning ? 'pulse-border 1.5s ease-in-out infinite' : undefined,
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
        position: 'relative',
      }}
    >
      <NodeResizer
        isVisible={selected && !isLocked}
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
            nodes: enforceGroupLayout(state.nodes.map((node) => (
              node.id === id ? { ...node, position: { x, y } } : node
            ))),
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
      <div className="flow-node__frame">
        <div className="flow-node__stack">
          <div
            className="flow-node__header"
            style={{ minHeight: isGroupNode ? GROUP_HEADER_HEIGHT : undefined }}
          >
            <span
              className="flow-node__icon"
            >
              <Icon size={15} strokeWidth={2.1} />
            </span>
            {isGroupNode ? (
              <input
                value={groupTitleField.value}
                onChange={(event) => groupTitleField.onChange(event.target.value)}
                className="flow-node__title-input"
                placeholder="节点组"
                onFocus={() => groupTitleField.onFocus()}
                onBlur={(event) => groupTitleField.onBlur(event.target.value)}
                onCompositionStart={() => groupTitleField.onCompositionStart()}
                onCompositionEnd={(event) => groupTitleField.onCompositionEnd(event.currentTarget.value)}
                onClick={(event) => event.stopPropagation()}
                onMouseDown={(event) => event.stopPropagation()}
                onKeyDown={(event) => event.stopPropagation()}
              />
            ) : (
              <span className="flow-node__title">
                {def.label}
              </span>
            )}
            <button
              type="button"
              className={`flow-node__lock-button ${isLocked ? 'flow-node__lock-button--active' : ''}`}
              onClick={(event) => {
                event.stopPropagation();
                toggleNodesLocked([id], !isDirectlyLocked);
              }}
              onMouseDown={(event) => event.stopPropagation()}
              title={isLocked ? '解锁节点' : '锁定节点'}
              aria-label={isLocked ? '解锁节点' : '锁定节点'}
            >
              {isLocked ? <Lock size={13} strokeWidth={2.2} /> : <Unlock size={13} strokeWidth={2.2} />}
            </button>
            {isDisabled && (
              <span className="flow-node__state-chip">
                已禁用
              </span>
            )}
            {hasGeneratedMask && (
              <span className="flow-node__state-chip flow-node__state-chip--mask">
                Mask
              </span>
            )}
            {hasWarning && (
              <span className="flow-node__status-icon flow-node__status-icon--warning" title={warningMessage}>
                ⚠
              </span>
            )}
            {execStatus !== 'idle' && statusText && (
              <span
                className={`flow-node__status-text ${execStatus === 'running' ? 'flow-node__status-text--running' : ''} ${execStatus === 'error' ? 'flow-node__status-text--error' : ''}`}
                style={{ color: badge.color || undefined }}
                title={badge.label + (execError ? ': ' + execError : '')}
              >
                {statusText}
              </span>
            )}
          </div>

          {effectiveInputs.length > 0 && (
            <div
              className="flow-node__ports flow-node__ports--inputs"
            >
              {effectiveInputs.map((input) => (
                <InputPort key={input.id} input={input} connected={connectedInputs.has(input.id)} isConnectable={isConnectable} color={def.color} />
              ))}
            </div>
          )}

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

          {hasOutputs && (
            <div
              className="flow-node__ports flow-node__ports--outputs"
            >
              {def.outputs.map((output) => (
                <OutputPort key={output.id} output={output} isConnectable={isConnectable} color={def.color} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default memo(FlowNode);
