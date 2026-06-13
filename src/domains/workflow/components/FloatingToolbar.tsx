import { THEME_ICONS, THEME_LABELS } from '@/app/theme/constants';
import type { ThemeMode } from '@/shared/types';
import { Icon } from '@/shared/ui/icons';
import { Plus, Settings2, Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';

interface FloatingToolbarProps {
  onAddNode: () => void;
  onOpenAgent?: () => void;
  onOpenSettings?: () => void;
  onToggleTheme?: () => void;
  themeMode: ThemeMode;
}

export default function FloatingToolbar({
  onAddNode,
  onOpenAgent,
  onOpenSettings,
  onToggleTheme,
  themeMode,
}: FloatingToolbarProps) {
  return (
    <div className="workflow-floating-toolbar" aria-label="工作流工具">
      <FloatingToolbarButton icon={<Plus size={16} />} label="添加节点" onClick={onAddNode} testId="workflow-add-node" />
      <FloatingToolbarButton
        icon={<Settings2 size={16} />}
        label="打开设置"
        onClick={onOpenSettings}
        testId="workflow-open-settings"
      />
      <FloatingToolbarButton
        icon={<Sparkles size={16} />}
        label="打开Agent"
        onClick={onOpenAgent}
        testId="workflow-open-agent"
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
}: {
  icon: ReactNode;
  label: string;
  onClick?: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      className="workflow-floating-toolbar__button"
      aria-label={label}
      title={label}
      data-testid={testId}
      onClick={onClick}
    >
      {icon}
    </button>
  );
}
