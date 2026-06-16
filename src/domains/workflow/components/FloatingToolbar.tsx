import { THEME_ICONS, THEME_LABELS } from '@/app/theme/constants';
import type { ThemeMode } from '@/shared/types';
import { Icon } from '@/shared/ui/icons';
import { AlignStartVertical, Grid3x3, PanelRightClose, PanelRightOpen, Plus, Settings2, Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';

interface FloatingToolbarProps {
  onAddNode: () => void;
  onOpenAgent?: () => void;
  onOpenSettings?: () => void;
  onToggleTheme?: () => void;
  themeMode: ThemeMode;
  onToggleRightPanel?: () => void;
  rightPanelCollapsed?: boolean;
  onToggleSnapToGrid?: () => void;
  snapToGridEnabled?: boolean;
  onAutoArrange?: () => void;
}

export default function FloatingToolbar({
  onAddNode,
  onOpenAgent,
  onOpenSettings,
  onToggleTheme,
  themeMode,
  onToggleRightPanel,
  rightPanelCollapsed,
  onToggleSnapToGrid,
  snapToGridEnabled,
  onAutoArrange,
}: FloatingToolbarProps) {
  return (
    <div className="workflow-floating-toolbar" aria-label="工作流工具">
      <FloatingToolbarButton icon={<Plus size={16} />} label="添加节点" onClick={onAddNode} testId="workflow-add-node" />
      <FloatingToolbarButton
        icon={rightPanelCollapsed ? <PanelRightOpen size={16} /> : <PanelRightClose size={16} />}
        label={rightPanelCollapsed ? '展开结果栏' : '收起结果栏'}
        onClick={onToggleRightPanel}
        testId="workflow-toggle-right-panel"
      />
      <FloatingToolbarButton
        icon={<Grid3x3 size={16} />}
        label={snapToGridEnabled ? '关闭网格吸附' : '开启网格吸附'}
        onClick={onToggleSnapToGrid}
        active={snapToGridEnabled}
        testId="workflow-toggle-snap-grid"
      />
      <FloatingToolbarButton
        icon={<AlignStartVertical size={16} />}
        label="自动整理"
        onClick={onAutoArrange}
        testId="workflow-auto-arrange"
      />
      <FloatingToolbarButton
        icon={<Sparkles size={16} />}
        label="打开Agent"
        onClick={onOpenAgent}
        testId="workflow-open-agent"
      />
      <FloatingToolbarButton
        icon={<Settings2 size={16} />}
        label="打开设置"
        onClick={onOpenSettings}
        testId="workflow-open-settings"
      />
      <FloatingToolbarButton
        icon={<Icon name={THEME_ICONS[themeMode]} size={16} />}
        label={`调整主题：${THEME_LABELS[themeMode]}`}
        onClick={onToggleTheme}
        testId="workflow-toggle-theme"
      />
    </div>
  );
}

function FloatingToolbarButton({
  icon,
  label,
  onClick,
  testId,
  active = false,
}: {
  icon: ReactNode;
  label: string;
  onClick?: () => void;
  testId: string;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      className="workflow-floating-toolbar__button"
      aria-label={label}
      title={label}
      data-testid={testId}
      onClick={onClick}
      style={active ? { color: 'var(--color-accent)' } : undefined}
    >
      {icon}
    </button>
  );
}
