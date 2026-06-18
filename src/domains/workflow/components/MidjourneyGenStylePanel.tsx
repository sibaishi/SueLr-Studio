import { useWorkflowStore } from '@/domains/workflow/lib/store';
import { BoxSelect, Gauge } from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';

const FIELD_STYLE: React.CSSProperties = {
  width: '100%',
  minHeight: 30,
  border: '1px solid var(--t-border)',
  borderRadius: 8,
  background: 'var(--t-bg2)',
  color: 'var(--t-text)',
  fontSize: 12,
  padding: '5px 8px',
  outline: 'none',
};

export default function MidjourneyGenStylePanel() {
  const nodes = useWorkflowStore((state) => state.nodes);
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);
  const availableModels = useWorkflowStore((state) => state.availableModels);
  const node = nodes.find((item) => item.selected && item.type === 'midjourneyGen');
  const [openPopover, setOpenPopover] = useState<'model' | 'mode' | null>(null);

  useEffect(() => {
    if (!node) setOpenPopover(null);
  }, [node]);

  const data = (node?.data || {}) as Record<string, unknown>;
  const setData = useCallback((patch: Record<string, unknown>) => {
    if (node) updateNodeData(node.id, patch);
  }, [node, updateNodeData]);

  const modelOptions = useMemo(() => availableModels.image || [], [availableModels.image]);
  if (!node) return null;

  const selectedModel = String(data.model || '');
  const selectedMode = String(data.mode || 'fast');

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 80,
        left: '50%',
        zIndex: 30,
        display: 'flex',
        width: 'min(640px, calc(100% - 44px))',
        height: 150,
        transform: 'translateX(-50%)',
        flexDirection: 'column',
        gap: 10,
        padding: 8,
        border: '1px solid var(--t-border)',
        borderRadius: 25,
        background: 'var(--t-card)',
        backdropFilter: 'blur(40px)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
      }}
    >
      <div style={{ position: 'relative', display: 'flex', minHeight: 0, flex: 1 }}>
        <textarea
          className="nodrag nowheel"
          value={String(data.prompt || '')}
          onChange={(event) => setData({ prompt: event.target.value })}
          placeholder="输入 Midjourney 提示词..."
          onPointerDown={(event) => event.stopPropagation()}
          style={{
            width: '100%',
            height: '100%',
            resize: 'none',
            border: '1px solid var(--t-border)',
            borderRadius: 15,
            outline: 'none',
            background: 'var(--t-bg2)',
            color: 'var(--t-text)',
            fontSize: 13,
            lineHeight: 1.6,
            padding: '10px 14px 44px',
            fontFamily: 'inherit',
          }}
        />
        <div className="nodrag" style={{ position: 'absolute', right: 6, bottom: 6, display: 'flex', gap: 4 }}>
          <PanelPopover
            icon={<BoxSelect size={14} />}
            label="模型"
            open={openPopover === 'model'}
            onToggle={() => setOpenPopover(openPopover === 'model' ? null : 'model')}
          >
            <select
              value={selectedModel}
              onChange={(event) => {
                setData({ model: event.target.value });
                setOpenPopover(null);
              }}
              className="nodrag"
              style={FIELD_STYLE}
            >
              <option value="">请选择 Midjourney 模型</option>
              {modelOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </PanelPopover>
          <PanelPopover
            icon={<Gauge size={14} />}
            label="生成模式"
            open={openPopover === 'mode'}
            onToggle={() => setOpenPopover(openPopover === 'mode' ? null : 'mode')}
          >
            <select
              value={selectedMode}
              onChange={(event) => {
                setData({ mode: event.target.value });
                setOpenPopover(null);
              }}
              className="nodrag"
              style={FIELD_STYLE}
            >
              <option value="fast">Fast</option>
              <option value="relax">Relax</option>
              <option value="turbo">Turbo</option>
            </select>
          </PanelPopover>
        </div>
      </div>
    </div>
  );
}

function PanelPopover({
  icon,
  label,
  open,
  onToggle,
  children,
}: {
  icon: ReactNode;
  label: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        className="nodrag"
        onClick={onToggle}
        title={label}
        style={{
          display: 'flex',
          width: 30,
          height: 30,
          alignItems: 'center',
          justifyContent: 'center',
          border: open ? '1px solid var(--t-border)' : '1px solid transparent',
          borderRadius: 10,
          background: open ? 'var(--t-bg2)' : 'transparent',
          color: open ? 'var(--t-text)' : 'var(--t-text3)',
          cursor: 'pointer',
        }}
      >
        {icon}
      </button>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 31 }} onClick={onToggle} />
          <div
            className="nodrag"
            style={{
              position: 'absolute',
              right: 0,
              bottom: '100%',
              zIndex: 32,
              minWidth: 260,
              marginBottom: 6,
              padding: 10,
              border: '1px solid var(--t-border)',
              borderRadius: 15,
              background: 'var(--t-card)',
              backdropFilter: 'blur(40px)',
              boxShadow: '0 -4px 32px rgba(0,0,0,0.18)',
            }}
          >
            {children}
          </div>
        </>
      )}
    </div>
  );
}
