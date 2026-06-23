import {
  WorkflowInputPreviewStrip,
  type WorkflowPreviewGroup,
} from '@/domains/workflow/components/WorkflowInputPreviewStrip';
import {
  StylePanelPopoverButton,
  WorkflowStylePanelShell,
} from '@/domains/workflow/components/WorkflowStylePanelShell';
import {
  filterMaterialProcessItems,
  resolveMaterialProcessInputItems,
} from '@/domains/workflow/components/nodes/merge/MaterialProcess/materialProcessInputs';
import { getNodeDef } from '@/domains/workflow/lib/constants';
import { useWorkflowStore } from '@/domains/workflow/lib/store';
import { ArrowsDownUp, FileText, GridNine, Stack } from '@phosphor-icons/react';
import { useCallback, useEffect, useMemo, useState } from 'react';

const PANEL_NODE_TYPES = new Set(['io', 'aiV3', 'materialProcess']);
const TYPE_ORDER = ['text', 'image'] as const;

const fieldStyle: React.CSSProperties = {
  border: '1px solid color-mix(in srgb, var(--t-border) 72%, transparent)',
  borderRadius: 9,
  background: 'color-mix(in srgb, var(--t-bg2) 60%, transparent)',
  color: 'var(--t-text)',
  fontSize: 12,
  padding: '6px 10px',
  minHeight: 32,
  outline: 'none',
  fontFamily: 'var(--font-sans)',
};

const optionButtonStyle = (selected: boolean): React.CSSProperties => ({
  height: 30,
  padding: '0 10px',
  borderRadius: 9,
  border: selected
    ? '1px solid color-mix(in srgb, #AF52DE 80%, transparent)'
    : '1px solid color-mix(in srgb, var(--t-border) 55%, transparent)',
  background: selected ? 'color-mix(in srgb, #AF52DE 18%, var(--t-bg2))' : 'var(--t-bg2)',
  color: selected ? '#AF52DE' : 'var(--t-text2)',
  cursor: 'pointer',
  fontSize: 12,
  fontWeight: selected ? 600 : 450,
});

export default function MaterialProcessStylePanel() {
  const nodes = useWorkflowStore((state) => state.nodes);
  const edges = useWorkflowStore((state) => state.edges);
  const nodeOutputs = useWorkflowStore((state) => state.nodeOutputs);
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);
  const [openPopover, setOpenPopover] = useState<string | null>(null);

  const materialNode = useMemo(() => {
    const selectedPanelNodes = nodes.filter((node) => node.selected && PANEL_NODE_TYPES.has(node.type || ''));
    if (selectedPanelNodes.length !== 1 || selectedPanelNodes[0].type !== 'materialProcess') return null;
    return selectedPanelNodes[0];
  }, [nodes]);

  useEffect(() => {
    if (!materialNode) setOpenPopover(null);
  }, [materialNode]);

  const nodeId = materialNode?.id;
  const data = (materialNode?.data || {}) as Record<string, unknown>;
  const materialType = data.materialType === 'text' || data.materialType === 'image' ? data.materialType : 'auto';
  const splitEnabled = data.splitEnabled !== false;
  const iterateEnabled = data.iterateEnabled === true;

  const allItems = useMemo(
    () => (nodeId ? resolveMaterialProcessInputItems(nodeId, nodes, edges, nodeOutputs) : []),
    [nodeId, nodes, edges, nodeOutputs],
  );
  const supportedItems = allItems.filter((item) => item.type === 'text' || item.type === 'image');
  const autoDetectedTypes = new Set(supportedItems.map((item) => item.type));
  const hasMixedAutoInput = materialType === 'auto' && autoDetectedTypes.size > 1;
  const adoptedItems = useMemo(
    () => (hasMixedAutoInput ? [] : filterMaterialProcessItems(allItems, materialType)),
    [allItems, hasMixedAutoInput, materialType],
  );
  const adoptedItemIds = useMemo(() => new Set(adoptedItems.map((item) => item.id)), [adoptedItems]);

  const previewGroups = useMemo(() => {
    const groups: Record<string, WorkflowPreviewGroup[]> = {};
    for (const type of TYPE_ORDER) {
      const items = supportedItems.filter((item) => item.type === type);
      if (items.length === 0) continue;
      const bySource = new Map<string, typeof items>();
      for (const item of items) {
        const sourceItems = bySource.get(item.sourceNodeId) || [];
        sourceItems.push(item);
        bySource.set(item.sourceNodeId, sourceItems);
      }
      groups[type] = Array.from(bySource.entries()).map(([sourceNodeId, sourceItems]) => {
        const sourceNode = nodes.find((node) => node.id === sourceNodeId);
        const sourceData = (sourceNode?.data || {}) as Record<string, unknown>;
        return {
          sourceNodeId,
          sourceNodeLabel:
            (typeof sourceData.label === 'string' && sourceData.label) ||
            getNodeDef(sourceNode?.type || '')?.label ||
            sourceNodeId,
          items: sourceItems.map((item) => ({
            id: item.id,
            type: item.type,
            label: item.type === 'text' ? '文本' : '图像',
            value: item.value,
          })),
        };
      });
    }
    return groups;
  }, [nodes, supportedItems]);

  const patch = useCallback(
    (next: Record<string, unknown>) => {
      if (nodeId) updateNodeData(nodeId, next);
    },
    [nodeId, updateNodeData],
  );

  if (!materialNode) return null;

  const setProcessingFlag = (key: 'splitEnabled' | 'iterateEnabled', enabled: boolean) => {
    if (!enabled) {
      const otherEnabled = key === 'splitEnabled' ? iterateEnabled : splitEnabled;
      if (!otherEnabled) {
        patch({
          [key]: false,
          [key === 'splitEnabled' ? 'iterateEnabled' : 'splitEnabled']: true,
        });
        return;
      }
    }
    patch({ [key]: enabled });
  };

  const typeHint = materialType === 'auto' ? '自动' : materialType === 'text' ? '文本' : '图像';
  const modeHint = splitEnabled && iterateEnabled ? '拆分+逐项' : splitEnabled ? '拆分' : '逐项';

  return (
    <WorkflowStylePanelShell>
      <WorkflowInputPreviewStrip groups={previewGroups} typeOrder={TYPE_ORDER} adoptedItemIds={adoptedItemIds} />

      <div
        style={{
          flex: 1,
          minHeight: 0,
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: '1px solid var(--t-border)',
          borderRadius: 15,
          background: 'var(--t-bg2)',
          color: 'var(--t-text3)',
          fontSize: 12,
        }}
      >
        {supportedItems.length === 0 ? (
          <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <Stack size={18} /> 等待文本或图像输入
          </span>
        ) : hasMixedAutoInput ? (
          <span>检测到文本与图像，请在“素材类型”中选择要处理的类型</span>
        ) : (
          <span>
            已采纳 {adoptedItems.length} 项，忽略 {allItems.length - adoptedItems.length} 项
          </span>
        )}

        <div className="nodrag" style={{ position: 'absolute', bottom: 6, right: 6, display: 'flex', gap: 4 }}>
          <StylePanelPopoverButton
            icon={<Stack size={14} />}
            label="素材类型"
            valueHint={typeHint}
            open={openPopover === 'type'}
            onToggle={() => setOpenPopover((current) => (current === 'type' ? null : 'type'))}
          >
            <div style={{ display: 'flex', gap: 6 }}>
              {(['auto', 'text', 'image'] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  style={optionButtonStyle(materialType === type)}
                  onClick={() => {
                    patch({ materialType: type });
                    setOpenPopover(null);
                  }}
                >
                  {type === 'auto' ? '自动识别' : type === 'text' ? '文本' : '图像'}
                </button>
              ))}
            </div>
          </StylePanelPopoverButton>

          <StylePanelPopoverButton
            icon={<ArrowsDownUp size={14} />}
            label="处理模式"
            valueHint={modeHint}
            open={openPopover === 'mode'}
            onToggle={() => setOpenPopover((current) => (current === 'mode' ? null : 'mode'))}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--t-text2)', fontSize: 12 }}>
                <input
                  type="checkbox"
                  checked={splitEnabled}
                  onChange={(event) => setProcessingFlag('splitEnabled', event.target.checked)}
                />
                拆分素材
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--t-text2)', fontSize: 12 }}>
                <input
                  type="checkbox"
                  checked={iterateEnabled}
                  onChange={(event) => setProcessingFlag('iterateEnabled', event.target.checked)}
                />
                逐项执行
              </label>
            </div>
          </StylePanelPopoverButton>

          {splitEnabled && materialType !== 'image' && (
            <StylePanelPopoverButton
              icon={<FileText size={14} />}
              label="文本拆分"
              valueHint={`${Number(data.outputCount ?? 2)} 项`}
              open={openPopover === 'text'}
              onToggle={() => setOpenPopover((current) => (current === 'text' ? null : 'text'))}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={{ fontSize: 11, color: 'var(--t-text3)' }}>分隔符</label>
                <input
                  value={typeof data.separator === 'string' ? data.separator : '\n'}
                  onChange={(event) => patch({ separator: event.target.value })}
                  style={fieldStyle}
                />
                <label style={{ fontSize: 11, color: 'var(--t-text3)' }}>输出上限</label>
                <input
                  type="number"
                  min={1}
                  max={9}
                  value={Number(data.outputCount ?? 2)}
                  onChange={(event) => patch({ outputCount: Number(event.target.value) })}
                  style={fieldStyle}
                />
              </div>
            </StylePanelPopoverButton>
          )}

          {splitEnabled && materialType !== 'text' && (
            <StylePanelPopoverButton
              icon={<GridNine size={14} />}
              label="图像网格"
              valueHint={`${Number(data.rows ?? 3)}×${Number(data.columns ?? 3)}`}
              open={openPopover === 'grid'}
              onToggle={() => setOpenPopover((current) => (current === 'grid' ? null : 'grid'))}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <select
                  value={Number(data.rows ?? 3)}
                  onChange={(event) => patch({ rows: Number(event.target.value) })}
                  style={fieldStyle}
                >
                  {[1, 2, 3].map((value) => (
                    <option key={value} value={value}>
                      {value} 行
                    </option>
                  ))}
                </select>
                <span style={{ color: 'var(--t-text3)' }}>×</span>
                <select
                  value={Number(data.columns ?? 3)}
                  onChange={(event) => patch({ columns: Number(event.target.value) })}
                  style={fieldStyle}
                >
                  {[1, 2, 3].map((value) => (
                    <option key={value} value={value}>
                      {value} 列
                    </option>
                  ))}
                </select>
              </div>
            </StylePanelPopoverButton>
          )}
        </div>
      </div>
    </WorkflowStylePanelShell>
  );
}
