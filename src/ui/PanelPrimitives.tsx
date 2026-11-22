import type { ComponentProps, HTMLAttributes, ReactNode } from 'react';

/** 结果、助手等侧栏共用的展示组件；数据与操作由领域模块注入。 */
export function PanelSurface({ className = '', ...props }: ComponentProps<'aside'>) {
  return <aside className={`ui-panel ui-floating-surface ${className}`} {...props} />;
}

export function PanelHeader({
  title,
  description,
  eyebrow,
  actions,
  className = '',
  ...props
}: HTMLAttributes<HTMLElement> & { title: string; description?: string; eyebrow?: string; actions?: ReactNode }) {
  return (
    <header className={`ui-panel-header ${className}`} {...props}>
      <div className="ui-panel-heading">
        {eyebrow && <p className="ui-panel-eyebrow">{eyebrow}</p>}
        <h2 className="ui-panel-title">{title}</h2>
        {description && <p className="ui-panel-description">{description}</p>}
      </div>
      {actions && <div className="ui-panel-actions">{actions}</div>}
    </header>
  );
}

export function PanelCard({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`ui-panel-card ${className}`} {...props} />;
}

export function PanelEmptyState({
  icon,
  title,
  children,
  action,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="ui-panel-empty">
      <span className="ui-panel-empty-icon" aria-hidden="true">
        {icon}
      </span>
      <h3>{title}</h3>
      <div className="ui-panel-description">{children}</div>
      {action && <div className="ui-panel-empty-action">{action}</div>}
    </div>
  );
}

export function PanelTabs<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="ui-panel-tabs" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
