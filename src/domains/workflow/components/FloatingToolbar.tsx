import { THEME_LABELS } from '@/app/theme/constants';
import { ArcIcon } from '@/domains/agent/ArcIcon';
import type { ThemeMode } from '@/shared/types';
import { FolderOpen, Gear, GridNine, Monitor, Moon, Plus, Sun } from '@phosphor-icons/react';
import { IconButton as FloatingToolbarButton, ToolGroup } from '@/ui/CanvasPrimitives';
import { ArrangeNodesIcon, ResultsSidebarIcon } from './CanvasToolIcons';

const THEME_ICONS = { dark: Moon, light: Sun, system: Monitor };

interface FloatingToolbarProps {
  onAddNode: () => void;
  onOpenAssetLibrary?: () => void;
  onOpenSettings?: () => void;
  onToggleTheme?: () => void;
  themeMode: ThemeMode;
  onToggleRightPanel?: () => void;
  rightPanelCollapsed?: boolean;
  onToggleAgent: () => void;
  agentOpen: boolean;
  onToggleSnapToGrid?: () => void;
  snapToGridEnabled?: boolean;
  onAutoArrange?: () => void;
}

export default function FloatingToolbar({
  onAddNode,
  onOpenAssetLibrary,
  onOpenSettings,
  onToggleTheme,
  themeMode,
  onToggleRightPanel,
  rightPanelCollapsed,
  onToggleAgent,
  agentOpen,
  onToggleSnapToGrid,
  snapToGridEnabled,
  onAutoArrange,
}: FloatingToolbarProps) {
  const ThemeIcon = THEME_ICONS[themeMode];
  return (
    <div className="workflow-floating-tools">
      <button
        type="button"
        className="workflow-agent-launcher ui-floating-surface"
        aria-label={agentOpen ? '收起弧光' : '打开弧光'}
        title={agentOpen ? '收起弧光' : '打开弧光'}
        data-testid="workflow-toggle-agent"
        aria-pressed={agentOpen}
        onClick={onToggleAgent}
      >
        <ArcIcon size={20} />
      </button>
      <ToolGroup vertical className="workflow-floating-toolbar" label="工作流工具">
        <FloatingToolbarButton
          icon={<Plus size={16} />}
          label="添加节点"
          onClick={onAddNode}
          testId="workflow-add-node"
        />
        <FloatingToolbarButton
          icon={<FolderOpen size={16} />}
          label="打开资产库"
          onClick={onOpenAssetLibrary}
          testId="workflow-open-assets"
        />
        <FloatingToolbarButton
          icon={<ResultsSidebarIcon open={!rightPanelCollapsed} />}
          label={rightPanelCollapsed ? '展开结果栏' : '收起结果栏'}
          onClick={onToggleRightPanel}
          testId="workflow-toggle-right-panel"
          pressed={!rightPanelCollapsed}
        />
        <FloatingToolbarButton
          icon={<GridNine size={16} />}
          label={snapToGridEnabled ? '关闭网格吸附' : '开启网格吸附'}
          onClick={onToggleSnapToGrid}
          pressed={snapToGridEnabled}
          testId="workflow-toggle-snap-grid"
        />
        <FloatingToolbarButton
          icon={<ArrangeNodesIcon />}
          label="自动整理"
          onClick={onAutoArrange}
          testId="workflow-auto-arrange"
        />
        <FloatingToolbarButton
          icon={<Gear size={16} />}
          label="打开设置"
          onClick={onOpenSettings}
          testId="workflow-open-settings"
        />
        <FloatingToolbarButton
          icon={<ThemeIcon size={16} />}
          label={`调整主题：${THEME_LABELS[themeMode]}`}
          onClick={onToggleTheme}
          testId="workflow-toggle-theme"
        />
      </ToolGroup>
    </div>
  );
}
