import { getNodeDef, getNodeDefaultSize } from '@/domains/workflow/lib/constants';
import { formatDurationSeconds } from '@/domains/workflow/lib/executionFormat';
import { useWorkflowStore } from '@/domains/workflow/lib/store';
import { isNodeLockedWithAncestors } from '@/domains/workflow/lib/store/editorShared';
import { NodeAppendix } from '@/shared/ui/NodeAppendix';
import { Handle, NodeResizer, Position, useUpdateNodeInternals } from '@xyflow/react';
import { Copy, LockOpen, LockSimple, Play, Prohibit } from '@phosphor-icons/react';
import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NodeContent } from './NodeContent';
import { STATUS_BADGE } from './nodeConstants';
import './node-v2.css';
import './nodeAnimations.css';

export interface V2WorkflowNodeProps {
  id: string;
  data: Record<string, unknown>;
  selected: boolean;
  isConnectable: boolean;
}

interface V2WorkflowNodeShellProps extends V2WorkflowNodeProps {
  type: 'aiV3' | 'io';
  fallbackLabel: string;
  fallbackColor: string;
}

export function V2WorkflowNodeShell({
  id,
  data,
  selected,
  isConnectable,
  type,
  fallbackLabel,
  fallbackColor,
}: V2WorkflowNodeShellProps) {
  const def = getNodeDef(type);
  const execStatus = useWorkflowStore((state) => state.nodeExecStatus[id] || 'idle');
  const execError = useWorkflowStore((state) => state.nodeErrors[id]);
  const execTime = useWorkflowStore((state) => state.nodeExecutionTime[id]);
  const execStartedAt = useWorkflowStore((state) => state.nodeExecutionStartedAt[id]);
  const nodeOutputs = useWorkflowStore((state) => state.nodeOutputs[id]);
  const nodes = useWorkflowStore((state) => state.nodes);
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);
  const setNodeSize = useWorkflowStore((state) => state.setNodeSize);
  const snapToGridEnabled = useWorkflowStore((state) => state.snapToGridEnabled);
  const toggleNodesLocked = useWorkflowStore((state) => state.toggleNodesLocked);
  const duplicateNode = useWorkflowStore((state) => state.duplicateNode);
  const executeWorkflowToNode = useWorkflowStore((state) => state.executeWorkflowToNode);
  const updateNodeInternals = useUpdateNodeInternals();

  const isDisabled = Boolean(data.disabled);
  const isLocked = isNodeLockedWithAncestors(id, nodes);
  const isDirectlyLocked = Boolean(data.locked);
  const isRunning = execStatus === 'running' && !isDisabled;
  const isError = execStatus === 'error';
  const warningMessage = typeof data.warning === 'string' ? data.warning : '';
  const hasWarning = !isError && Boolean(warningMessage);
  const badge = STATUS_BADGE[execStatus];
  const defaultLabel = def?.label || fallbackLabel;
  const customLabel = typeof data.label === 'string' ? data.label : '';
  const displayLabel = customLabel || defaultLabel;
  const [isEditingLabel, setIsEditingLabel] = useState(false);
  const [labelDraft, setLabelDraft] = useState('');
  const labelInputRef = useRef<HTMLInputElement>(null);

  const startEditing = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      setLabelDraft(customLabel || defaultLabel);
      setIsEditingLabel(true);
    },
    [customLabel, defaultLabel],
  );

  const commitLabel = useCallback(() => {
    setIsEditingLabel(false);
    const trimmed = labelDraft.trim();
    updateNodeData(id, { label: trimmed && trimmed !== defaultLabel ? trimmed : undefined });
  }, [defaultLabel, id, labelDraft, updateNodeData]);

  useEffect(() => {
    if (!isEditingLabel) return;
    labelInputRef.current?.focus();
    labelInputRef.current?.select();
  }, [isEditingLabel]);

  const minSize = def ? getNodeDefaultSize(type, 0) : { w: 280, h: 280 };
  const currentNode = nodes.find((node) => node.id === id);
  const parentId = (currentNode as typeof currentNode & { parentId?: string })?.parentId;
  const [tick, setTick] = useState(() => Date.now());

  useEffect(() => {
    if (!isRunning) return;
    const timer = window.setInterval(() => setTick(Date.now()), 200);
    return () => window.clearInterval(timer);
  }, [isRunning]);

  const statusText = useMemo(() => {
    if (execStatus === 'idle') return '';
    if (execStatus === 'running') {
      return formatDurationSeconds(Math.max(0, tick - (execStartedAt || tick)));
    }
    return formatDurationSeconds(execTime);
  }, [execStartedAt, execStatus, execTime, tick]);

  useEffect(() => {
    updateNodeInternals(id);
  }, [data, id, isLocked, parentId, updateNodeInternals]);

  if (!def) return null;

  const nodeColor = def.color || fallbackColor;
  const className = [
    'flow-node-v2 group',
    selected ? 'flow-node-v2--selected' : '',
    isError ? 'flow-node-v2--error' : '',
    hasWarning ? 'flow-node-v2--warning' : '',
    isRunning ? 'flow-node-v2--running' : '',
    isDisabled ? 'flow-node-v2--disabled' : '',
    isLocked ? 'flow-node-v2--locked' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={className}
      style={
        {
          '--node-color': nodeColor,
          width: '100%',
          height: '100%',
          minWidth: minSize.w,
          minHeight: minSize.h,
          animation: isRunning ? 'pulse-border 1.5s ease-in-out infinite' : undefined,
          boxSizing: 'border-box',
          position: 'relative',
        } as CSSProperties
      }
    >
      <NodeAppendix position="top">
        <div className="node-v2-appendix-bar">
          {isEditingLabel ? (
            <input
              ref={labelInputRef}
              className="node-v2-appendix-label-input"
              value={labelDraft}
              onChange={(event) => setLabelDraft(event.target.value)}
              onBlur={commitLabel}
              onKeyDown={(event) => {
                if (event.key === 'Enter') commitLabel();
                if (event.key === 'Escape') setIsEditingLabel(false);
              }}
              onMouseDown={(event) => event.stopPropagation()}
            />
          ) : (
            <span className="node-v2-appendix-label" onClick={startEditing} title="点击重命名">
              <span className="node-v2-appendix-dot" style={{ backgroundColor: nodeColor }} />
              <span className="node-v2-appendix-label-text">{displayLabel}</span>
            </span>
          )}
          <div className="node-v2-appendix-divider" />
          <button
            type="button"
            className="node-v2-appendix-btn"
            onClick={(event) => {
              event.stopPropagation();
              updateNodeData(id, { disabled: !isDisabled });
            }}
            title={isDisabled ? '启用' : '禁用'}
          >
            <Prohibit size={15} style={{ color: isDisabled ? '#ff3b30' : undefined }} />
          </button>
          <div className="node-v2-appendix-divider" />
          <button
            type="button"
            className="node-v2-appendix-btn"
            onClick={(event) => {
              event.stopPropagation();
              toggleNodesLocked([id], !isDirectlyLocked);
            }}
            title={isLocked ? '解锁' : '锁定'}
          >
            {isLocked ? <LockSimple size={15} /> : <LockOpen size={15} />}
          </button>
          <div className="node-v2-appendix-divider" />
          <button
            type="button"
            className="node-v2-appendix-btn"
            onClick={(event) => {
              event.stopPropagation();
              duplicateNode(id);
            }}
            title="复制"
          >
            <Copy size={15} />
          </button>
          <div className="node-v2-appendix-divider" />
          <button
            type="button"
            className="node-v2-appendix-btn node-v2-appendix-btn--primary"
            onClick={(event) => {
              event.stopPropagation();
              executeWorkflowToNode(id);
            }}
            title="执行到此节点"
          >
            <Play size={15} />
          </button>
        </div>
      </NodeAppendix>

      {(isDisabled || hasWarning || execStatus !== 'idle') && (
        <NodeAppendix position="bottom" showOnHover={false}>
          {isDisabled && (
            <span className="node-v2-status-pill" style={{ color: 'var(--node-card-muted)' }}>
              已禁用
            </span>
          )}
          {hasWarning && (
            <span className="node-v2-status-pill" style={{ color: '#ff9500' }} title={warningMessage}>
              ⚠ {warningMessage}
            </span>
          )}
          {execStatus !== 'idle' && statusText && (
            <span
              className="node-v2-status-pill"
              style={{ color: badge.color || 'var(--node-card-ink)' }}
              title={badge.label + (execError ? `: ${execError}` : '')}
            >
              {badge.label === 'running'
                ? '执行中'
                : badge.label === 'error'
                  ? '出错'
                  : badge.label === 'success'
                    ? '完成'
                    : badge.label}{' '}
              {statusText}
            </span>
          )}
        </NodeAppendix>
      )}

      <NodeResizer
        isVisible={selected && !isLocked}
        minWidth={minSize.w}
        minHeight={minSize.h}
        onResizeEnd={(_, params) => {
          if (!snapToGridEnabled) return;
          const gridSize = 28;
          setNodeSize(id, {
            width: Math.max(minSize.w, Math.round(params.width / gridSize) * gridSize),
            height: Math.max(minSize.h, Math.round(params.height / gridSize) * gridSize),
          });
          useWorkflowStore.setState((state) => ({
            nodes: state.nodes.map((node) =>
              node.id === id
                ? {
                    ...node,
                    position: {
                      x: Math.round(params.x / gridSize) * gridSize,
                      y: Math.round(params.y / gridSize) * gridSize,
                    },
                  }
                : node,
            ),
            hasUnsavedChanges: true,
          }));
        }}
        lineStyle={{ borderColor: nodeColor, borderWidth: 1, borderStyle: 'dashed', opacity: 0.3 }}
        handleStyle={{
          width: 14,
          height: 14,
          borderRadius: 7,
          backgroundColor: nodeColor,
          border: '2px solid var(--color-bg-primary)',
          boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
        }}
      />

      <Handle
        type="target"
        position={Position.Left}
        id="input"
        isConnectable={isConnectable}
        style={{ left: -6, top: '50%', transform: 'translateY(-50%)' }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="result"
        isConnectable={isConnectable}
        style={{ right: -6, top: '50%', transform: 'translateY(-50%)' }}
      />

      <div className="flow-node-v2__frame">
        <NodeContent
          type={type}
          data={data}
          nodeId={id}
          def={def}
          updateNodeData={updateNodeData}
          outputs={nodeOutputs}
          showBottomBorder={false}
          connectedInputCount={0}
        />
      </div>
    </div>
  );
}
