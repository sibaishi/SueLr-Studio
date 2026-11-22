import { ActionButton, FloatingSurface, IconButton } from '@/ui/CanvasPrimitives';
import { ArrowCounterClockwise, Moon, SlidersHorizontal, Sun, X } from '@phosphor-icons/react';
import type { GalleryContent, GalleryData, GalleryNode } from './WorkflowGalleryNode';
import type { GalleryPanelScenario, GallerySidePanel } from './WorkflowGallerySidePanels';

// 开发检查工具只通过属性和回调操作演示数据，不读取正式项目状态。
type InspectorProps = {
  nodes: GalleryNode[];
  selected?: GalleryNode;
  message: string;
  inputState: string;
  emptyModels: boolean;
  grid: boolean;
  sidePanel: GallerySidePanel;
  scenario: GalleryPanelScenario;
  onSidePanelChange: (panel: GallerySidePanel) => void;
  onScenarioChange: (scenario: GalleryPanelScenario) => void;
  onClose: () => void;
  onSelect: (id: string) => void;
  patch: (data: Partial<GalleryData>) => void;
  collapse: (id: string) => void;
  onInputStateChange: (value: string) => void;
  onEmptyModelsChange: (value: boolean) => void;
  onGridChange: (value: boolean) => void;
  onFit: () => void;
  onReset: () => void;
};

export function CanvasGalleryInspector({
  nodes,
  selected,
  message,
  inputState,
  emptyModels,
  grid,
  sidePanel,
  scenario,
  onSidePanelChange,
  onScenarioChange,
  onClose,
  onSelect,
  patch,
  collapse,
  onInputStateChange,
  onEmptyModelsChange,
  onGridChange,
  onFit,
  onReset,
}: InspectorProps) {
  return (
    <aside className="canvas-gallery-inspector" aria-label="组件检查面板">
      <div className="canvas-gallery-inspector-heading">
        <h2>检查组件</h2>
        <IconButton compact label="收起检查面板" icon={<X size={16} />} onClick={onClose} />
      </div>
      <p className="canvas-gallery-hint">点选画布对象，直接检查它的样式和交互。本页不调用模型、不保存项目。</p>
      <p className="canvas-gallery-hint">{message}</p>
      <label>
        画布侧栏
        <select
          aria-label="演示侧栏"
          value={sidePanel || ''}
          onChange={(event) => onSidePanelChange((event.target.value || null) as GallerySidePanel)}
        >
          <option value="">收起侧栏</option>
          <option value="results">结果栏</option>
          <option value="agent">弧光</option>
        </select>
      </label>
      {sidePanel && (
        <label>
          侧栏状态
          <select
            aria-label="演示侧栏状态"
            value={scenario}
            onChange={(event) => onScenarioChange(event.target.value as GalleryPanelScenario)}
          >
            <option value="content">有内容</option>
            <option value="empty">空白态</option>
            <option value="loading">加载／处理中</option>
            <option value="error">错误态</option>
          </select>
        </label>
      )}
      <div className="canvas-gallery-inspector-divider" />
      <label>
        当前对象
        <select aria-label="选择演示对象" value={selected?.id || ''} onChange={(event) => onSelect(event.target.value)}>
          <option value="">未选择</option>
          {nodes
            .filter((node) => !node.hidden)
            .map((node) => (
              <option key={node.id} value={node.id}>
                {node.data.title}
              </option>
            ))}
        </select>
      </label>
      {selected && (
        <>
          <label>
            标题
            <input
              aria-label="演示对象标题"
              value={selected.data.title}
              onChange={(event) => patch({ title: event.target.value })}
            />
          </label>
          <label className="canvas-gallery-check">
            <input
              type="checkbox"
              checked={Boolean(selected.data.locked)}
              onChange={(event) => patch({ locked: event.target.checked })}
            />
            锁定
          </label>
          {selected.data.kind === 'group' ? (
            <ActionButton onClick={() => collapse(selected.id)}>
              {selected.data.collapsed ? '展开分组' : '折叠分组'}
            </ActionButton>
          ) : (
            <>
              <label>
                内容
                <select
                  aria-label="演示节点内容类型"
                  value={selected.data.content}
                  onChange={(event) => patch({ content: event.target.value as GalleryContent })}
                >
                  <option value="empty">空白态</option>
                  <option value="text">文本</option>
                  <option value="image">图片</option>
                  <option value="audio">音频控件</option>
                  <option value="video">视频控件</option>
                </select>
              </label>
              <label>
                执行状态
                <select
                  aria-label="演示节点执行状态"
                  value={selected.data.status || 'idle'}
                  onChange={(event) => patch({ status: event.target.value as GalleryData['status'] })}
                >
                  <option value="idle">待执行</option>
                  <option value="running">执行中</option>
                  <option value="success">完成</option>
                  <option value="error">出错</option>
                </select>
              </label>
              <label className="canvas-gallery-check">
                <input
                  type="checkbox"
                  checked={Boolean(selected.data.disabled)}
                  onChange={(event) => patch({ disabled: event.target.checked })}
                />
                禁用
              </label>
              <label className="canvas-gallery-check">
                <input
                  type="checkbox"
                  checked={Boolean(selected.data.warning)}
                  onChange={(event) => patch({ warning: event.target.checked })}
                />
                输入警告
              </label>
              <label>
                输入状态
                <select
                  aria-label="演示输入状态"
                  value={inputState}
                  onChange={(event) => onInputStateChange(event.target.value)}
                >
                  <option value="editable">可编辑</option>
                  <option value="readonly">只读</option>
                  <option value="disabled">禁用</option>
                  <option value="invalid">错误</option>
                </select>
              </label>
              {selected.data.kind === 'ai' && (
                <label className="canvas-gallery-check">
                  <input
                    type="checkbox"
                    checked={emptyModels}
                    onChange={(event) => onEmptyModelsChange(event.target.checked)}
                  />
                  没有已启用模型
                </label>
              )}
            </>
          )}
        </>
      )}
      <div className="canvas-gallery-inspector-divider" />
      <label className="canvas-gallery-check">
        <input type="checkbox" checked={grid} onChange={(event) => onGridChange(event.target.checked)} />
        显示画布网格
      </label>
      <p className="canvas-gallery-hint">
        4px 步进 · 12px 节奏
        <br />
        双击图片或文本可预览。音视频仅展示控件。
      </p>
      <ActionButton onClick={onFit}>适应示例画布</ActionButton>
      <ActionButton onClick={onReset}>重置全部示例</ActionButton>
    </aside>
  );
}

export function CanvasGalleryTools({
  theme,
  docked,
  inspector,
  onThemeChange,
  onToggleInspector,
  onReset,
}: {
  theme: 'dark' | 'light';
  docked: boolean;
  inspector: boolean;
  onThemeChange: () => void;
  onToggleInspector: () => void;
  onReset: () => void;
}) {
  return (
    <FloatingSurface
      className="canvas-gallery-header-actions"
      data-side-panel={docked || undefined}
      aria-label="组件库检查工具"
    >
      <span className="canvas-gallery-label">组件库</span>
      <IconButton
        compact
        label={theme === 'dark' ? '切换浅色模式' : '切换深色模式'}
        icon={theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        onClick={onThemeChange}
      />
      <IconButton
        compact
        label="显示检查面板"
        pressed={inspector}
        icon={<SlidersHorizontal size={16} />}
        onClick={() => onToggleInspector()}
      />
      <IconButton compact label="重置示例" icon={<ArrowCounterClockwise size={16} />} onClick={onReset} />
    </FloatingSurface>
  );
}
