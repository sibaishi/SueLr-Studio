import { getNodeDefaultSize, getNodeDef } from '@/domains/workflow/lib/constants';
import { useWorkflowStore } from '@/domains/workflow/lib/store';
import { isNodeLockedWithAncestors } from '@/domains/workflow/lib/store/editorShared';
import { NodeAppendix } from '@/shared/ui/NodeAppendix';
import { Handle, NodeResizer, Position, useUpdateNodeInternals } from '@xyflow/react';
import { Ban, Copy, Lock, Play, Unlock } from 'lucide-react';
import { type CSSProperties, memo, useEffect, useMemo } from 'react';
import { formatDurationSeconds } from '@/domains/workflow/lib/executionFormat';
import { STATUS_BADGE } from '../../nodeConstants';
import { NodeContent } from '../../NodeContent';
import '../../node-v2.css';
import '../../nodeAnimations.css';

interface ImageGenV2NodeProps {
  id: string;
  data: Record<string, unknown>;
  selected: boolean;
  isConnectable: boolean;
}

function ImageGenV2Node({ id, data, selected, isConnectable }: ImageGenV2NodeProps) {
  const type = 'imageGenV2';
  const def = getNodeDef(type);
  const execStatus = useWorkflowStore((s) => s.nodeExecStatus[id] || 'idle');
  const execError = useWorkflowStore((s) => s.nodeErrors[id]);
  const execTime = useWorkflowStore((s) => s.nodeExecutionTime[id]);
  const execStartedAt = useWorkflowStore((s) => s.nodeExecutionStartedAt[id]);
  const warningMessage = useWorkflowStore((s) => s.nodeWarnings[id]);
  const nodeOutputs = useWorkflowStore((s) => s.nodeOutputs[id]);
  const nodes = useWorkflowStore((s) => s.nodes);
  const updateNodeData = useWorkflowStore((s) => s.updateNodeData);
  const setNodeSize = useWorkflowStore((s) => s.setNodeSize);
  const snapToGridEnabled = useWorkflowStore((s) => s.snapToGridEnabled);
  const toggleNodesLocked = useWorkflowStore((s) => s.toggleNodesLocked);
  const duplicateNode = useWorkflowStore((s) => s.duplicateNode);
  const executeWorkflowToNode = useWorkflowStore((s) => s.executeWorkflowToNode);
  const updateNodeInternals = useUpdateNodeInternals();

  const isDisabled = Boolean(data.disabled);
  const isLocked = isNodeLockedWithAncestors(id, nodes);
  const isDirectlyLocked = Boolean(data.locked);
  const isRunning = execStatus === 'running' && !isDisabled;
  const isError = execStatus === 'error';
  const hasWarning = Boolean(warningMessage) && !isError;
  const badge = STATUS_BADGE[execStatus];

  const minSize = def ? getNodeDefaultSize(type, 0) : { w: 280, h: 280 };
  const currentNode = nodes.find((node) => node.id === id);
  const parentId = (currentNode as typeof currentNode & { parentId?: string })?.parentId;

  const statusText = useMemo(() => {
    if (execStatus === 'idle' || execStatus === 'running') return '';
    return formatDurationSeconds(execTime);
  }, [execStatus, execTime]);

  useEffect(() => {
    updateNodeInternals(id);
  }, [data, id, isLocked, parentId, updateNodeInternals]);

  const className = [
    'flow-node-v2',
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
      style={{
        '--node-color': def?.color || '#FF9500',
        width: '100%',
        height: '100%',
        minWidth: minSize.w,
        minHeight: minSize.h,
        animation: isRunning ? 'pulse-border 1.5s ease-in-out infinite' : undefined,
        boxSizing: 'border-box',
        position: 'relative',
      } as CSSProperties}
    >
      {/* Appendix buttons */}
      <NodeAppendix position="top" showOnHover={false}>
        <button type="button" style={{ width:36,height:36,display:'flex',alignItems:'center',justifyContent:'center',borderRadius:10,background:'var(--t-card)',backdropFilter:'blur(40px)',border:'1px solid var(--t-border)',color:'var(--t-text2)',cursor:'pointer',boxShadow:'0 1px 3px rgba(0,0,0,0.08)' }} onClick={(e)=>{e.stopPropagation();updateNodeData(id,{disabled:!isDisabled})}} title={isDisabled?'启用':'禁用'}>
          <Ban size={15} style={{color:isDisabled?'var(--t-red)':undefined}}/>
        </button>
        <button type="button" style={{ width:36,height:36,display:'flex',alignItems:'center',justifyContent:'center',borderRadius:10,background:'var(--t-card)',backdropFilter:'blur(40px)',border:'1px solid var(--t-border)',color:'var(--t-text2)',cursor:'pointer',boxShadow:'0 1px 3px rgba(0,0,0,0.08)' }} onClick={(e)=>{e.stopPropagation();toggleNodesLocked([id],!isDirectlyLocked)}} title={isLocked?'解锁':'锁定'}>
          {isLocked?<Lock size={15}/>:<Unlock size={15}/>}
        </button>
        <button type="button" style={{ width:36,height:36,display:'flex',alignItems:'center',justifyContent:'center',borderRadius:10,background:'var(--t-card)',backdropFilter:'blur(40px)',border:'1px solid var(--t-border)',color:'var(--t-text2)',cursor:'pointer',boxShadow:'0 1px 3px rgba(0,0,0,0.08)' }} onClick={(e)=>{e.stopPropagation();duplicateNode(id)}} title="复制">
          <Copy size={15}/>
        </button>
        <button type="button" style={{ width:36,height:36,display:'flex',alignItems:'center',justifyContent:'center',borderRadius:10,background:'var(--t-card)',backdropFilter:'blur(40px)',border:'1px solid var(--t-border)',color:'var(--t-text2)',cursor:'pointer',boxShadow:'0 1px 3px rgba(0,0,0,0.08)' }} onClick={(e)=>{e.stopPropagation();executeWorkflowToNode(id)}} title="执行到此节点">
          <Play size={15}/>
        </button>
      </NodeAppendix>

      {/* Bottom status */}
      {(isDisabled||hasWarning||execStatus!=='idle')&&(
        <NodeAppendix position="bottom" showOnHover={false}>
          {isDisabled&&(<span style={{padding:'6px 14px',fontSize:13,fontWeight:500,borderRadius:10,background:'var(--t-card)',backdropFilter:'blur(40px)',border:'1px solid var(--t-border)',color:'var(--t-text3)',boxShadow:'0 1px 3px rgba(0,0,0,0.08)'}}>已禁用</span>)}
          {hasWarning&&(<span style={{padding:'6px 14px',fontSize:13,fontWeight:500,borderRadius:10,background:'var(--t-card)',backdropFilter:'blur(40px)',border:'1px solid var(--t-border)',color:'var(--t-orange)',boxShadow:'0 1px 3px rgba(0,0,0,0.08)'}} title={warningMessage}>⚠ {warningMessage}</span>)}
          {execStatus!=='idle'&&statusText&&(<span style={{padding:'6px 14px',fontSize:13,fontWeight:500,borderRadius:10,background:'var(--t-card)',backdropFilter:'blur(40px)',border:'1px solid var(--t-border)',color:badge.color||'var(--t-text)',boxShadow:'0 1px 3px rgba(0,0,0,0.08)'}} title={badge.label+(execError?`: ${execError}`:'')}>{badge.label==='running'?'执行中':badge.label==='error'?'出错':badge.label==='success'?'完成':badge.label} {statusText}</span>)}
        </NodeAppendix>
      )}

      <NodeResizer
        isVisible={selected && !isLocked}
        minWidth={minSize.w}
        minHeight={minSize.h}
        onResizeEnd={(_, params) => {
          if (!snapToGridEnabled) return;
          const GRID_SIZE = 28;
          setNodeSize(id, {
            width: Math.max(minSize.w, Math.round(params.width / GRID_SIZE) * GRID_SIZE),
            height: Math.max(minSize.h, Math.round(params.height / GRID_SIZE) * GRID_SIZE),
          });
          useWorkflowStore.setState((state) => ({
            nodes: state.nodes.map((node) => (node.id === id ? { ...node, position: { x: Math.round(params.x / GRID_SIZE) * GRID_SIZE, y: Math.round(params.y / GRID_SIZE) * GRID_SIZE } } : node)),
            hasUnsavedChanges: true,
          }));
        }}
        lineStyle={{
          borderColor: def?.color || '#FF9500',
          borderWidth: 1,
          borderStyle: 'dashed',
          opacity: 0.3,
        }}
        handleStyle={{
          width: 14,
          height: 14,
          borderRadius: 7,
          backgroundColor: def?.color || '#FF9500',
          border: '2px solid var(--color-bg-primary)',
          boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
        }}
      />

      {/* Side ports */}
      <Handle
        type="target"
        position={Position.Left}
        id="input"
        isConnectable={isConnectable}
        style={{
          left: -6,
          top: '50%',
          transform: 'translateY(-50%)',
        }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="images"
        isConnectable={isConnectable}
        style={{
          right: -6,
          top: '50%',
          transform: 'translateY(-50%)',
        }}
      />

      {/* Content */}
      <div className="flow-node-v2__frame">
        <NodeContent
          type={type}
          data={data}
          nodeId={id}
          def={def!}
          updateNodeData={updateNodeData}
          outputs={nodeOutputs}
          showBottomBorder={false}
          connectedInputCount={0}
        />
      </div>
    </div>
  );
}

export default memo(ImageGenV2Node);
