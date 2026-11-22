import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';

export function FloatingSurface({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`ui-floating-surface ${className}`} {...props} />;
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  icon: ReactNode;
  active?: boolean;
  pressed?: boolean;
  compact?: boolean;
  testId?: string;
}

export function IconButton({
  label,
  icon,
  active,
  pressed,
  compact,
  testId,
  className = '',
  ...props
}: IconButtonProps) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      data-active={active || undefined}
      data-testid={testId}
      className={`ui-icon-button ${compact ? 'ui-icon-button--compact' : ''} ${className}`}
      {...props}
    >
      <span aria-hidden="true">{icon}</span>
    </button>
  );
}

interface ActionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  intent?: 'primary' | 'danger';
}

export function ActionButton({ intent = 'primary', className = '', ...props }: ActionButtonProps) {
  return <button type="button" className={`ui-action-button ui-action-button--${intent} ${className}`} {...props} />;
}

interface ToolGroupProps extends HTMLAttributes<HTMLDivElement> {
  label: string;
  vertical?: boolean;
}

export function ToolGroup({ label, vertical, className = '', ...props }: ToolGroupProps) {
  return (
    <FloatingSurface
      role="group"
      aria-label={label}
      className={`ui-tool-group ${vertical ? 'ui-tool-group--vertical' : ''} ${className}`}
      {...props}
    />
  );
}
