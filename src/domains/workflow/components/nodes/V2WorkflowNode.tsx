import { getNodeDef, getNodeDefaultSize } from '@/domains/workflow/lib/constants';
import { formatDurationSeconds } from '@/domains/workflow/lib/executionFormat';
import { useWorkflowStore } from '@/domains/workflow/lib/store';
import { isNodeLockedWithAncestors } from '@/domains/workflow/lib/store/editorShared';
import { NodeResizer, useUpdateNodeInternals } from '@xyflow/react';
import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NodeContent } from './NodeContent';
import { WorkflowCardPresentation, WorkflowCardToolbar } from './WorkflowCardPresentation';
import { WorkflowNodeIcon } from './WorkflowNodeIcon';
import './node-v2.css';
import './nodeAnimations.css';

export interface V2WorkflowNodeProps {
  id: string;
  data: Record<string, unknown>;
  selected: boolean;
  isConnectable: boolean;
}

interface V2WorkflowNodeShellProps extends V2WorkflowNodeProps {
  type: 'ai' | 'io';
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
  const defaultLabel = def?.label || fallbackLabel;
  const customLabel = typeof data.label === 'string' ? data.label : '';
  const displayLabel = customLabel || defaultLabel;
  const [isEditingLabel, setIsEditingLabel] = useState(false);
  const [labelDraft, setLabelDraft] = useState('');
  const labelInputRef = useRef<HTMLInputElement>(null);
  const labelButtonRef = useRef<HTMLButtonElement>(null);
  const restoreLabelFocusRef = useRef(false);

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
    if (isEditingLabel) {
      labelInputRef.current?.focus();
      labelInputRef.current?.select();
    } else if (restoreLabelFocusRef.current) {
      restoreLabelFocusRef.current = false;
      labelButtonRef.current?.focus();
    }
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
    <WorkflowCardPresentation
      color={def.color}
      isConnectable={isConnectable}
      status={execStatus}
      warning={hasWarning ? warningMessage : undefined}
      disabled={isDisabled}
      locked={isLocked}
      selected={selected}
      error={execError}
      duration={statusText}
      className={className}
      style={
        {
          '--node-color': nodeColor,
          width: '100%',
          height: '100%',
          minWidth: minSize.w,
          minHeight: minSize.h,
          boxSizing: 'border-box',
          position: 'relative',
        } as CSSProperties
      }
      toolbar={
        <WorkflowCardToolbar
          disabled={isDisabled}
          locked={isLocked}
          onToggleDisabled={() => updateNodeData(id, { disabled: !isDisabled })}
          onToggleLocked={() => toggleNodesLocked([id], !isDirectlyLocked)}
          onDuplicate={() => duplicateNode(id)}
          onExecute={() => executeWorkflowToNode(id)}
        >
          {isEditingLabel ? (
            <input
              ref={labelInputRef}
              className="node-v2-appendix-label-input"
              aria-label="节点名称"
              value={labelDraft}
              onChange={(event) => setLabelDraft(event.target.value)}
              onBlur={commitLabel}
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === 'Enter' || event.key === 'Escape') {
                  event.preventDefault();
                  restoreLabelFocusRef.current = true;
                  if (event.key === 'Enter') commitLabel();
                  else setIsEditingLabel(false);
                }
              }}
              onMouseDown={(event) => event.stopPropagation()}
            />
          ) : (
            <button
              ref={labelButtonRef}
              type="button"
              className="node-v2-appendix-label nodrag"
              onMouseDown={(event) => event.stopPropagation()}
              onClick={startEditing}
              title="点击重命名"
            >
              <span className="node-v2-appendix-type-icon" style={{ color: nodeColor }}>
                <WorkflowNodeIcon name={def.icon} size={14} />
              </span>
              <span className="node-v2-appendix-label-text">{displayLabel}</span>
            </button>
          )}
        </WorkflowCardToolbar>
      }
      resizer={
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
      }
    >
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
    </WorkflowCardPresentation>
  );
}
