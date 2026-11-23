import { WarningCircle } from '@phosphor-icons/react';
import type { ComponentProps, ReactNode } from 'react';
import { Button } from './FormPrimitives';
import { Badge } from './PanelPrimitives';

type StatusTone = 'info' | 'success' | 'warning' | 'error';

export function StatusNotice({
  tone = 'info',
  className = '',
  ...props
}: ComponentProps<'div'> & { tone?: StatusTone }) {
  return <div className={`ui-status-notice ${className}`} data-tone={tone} {...props} />;
}

export function ErrorPanel({
  title,
  children,
  onRetry,
  ...props
}: Omit<ComponentProps<'div'>, 'title'> & { title: string; children: ReactNode; onRetry: () => void }) {
  return (
    <div className="ui-error-panel" {...props}>
      <StatusNotice tone="error" role="alert">
        <WarningCircle size={26} aria-hidden="true" />
        <h2>{title}</h2>
        <p>{children}</p>
        <Button small onClick={onRetry}>
          重试
        </Button>
      </StatusNotice>
    </div>
  );
}

export function StatusBadge({ tone, className = '', ...props }: ComponentProps<'span'> & { tone: string }) {
  return <Badge compact className={`ui-status-badge ${className}`} data-tone={tone} {...props} />;
}
