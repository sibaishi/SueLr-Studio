import { X } from '@phosphor-icons/react';
import type { ComponentProps, ReactNode } from 'react';
import { IconButton } from './CanvasPrimitives';

export function DialogHeader({
  title,
  eyebrow,
  description,
  badge,
  actions,
  className = '',
}: {
  title: ReactNode;
  eyebrow?: ReactNode;
  description?: ReactNode;
  badge?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={`ui-dialog-header ${className}`}>
      <div className="ui-dialog-heading">
        {eyebrow && <div className="ui-dialog-eyebrow">{eyebrow}</div>}
        <h2 className="ui-dialog-title">
          {title}
          {badge}
        </h2>
        {description && <p className="ui-dialog-description">{description}</p>}
      </div>
      {actions && <div className="ui-dialog-actions">{actions}</div>}
    </header>
  );
}

export function DialogCloseButton({ label = '关闭', onClick }: { label?: string; onClick: () => void }) {
  return <IconButton compact className="ui-dialog-close" label={label} icon={<X size={18} />} onClick={onClick} />;
}

export function DialogFooter({ className = '', ...props }: ComponentProps<'footer'>) {
  return <footer className={`ui-dialog-footer ${className}`} {...props} />;
}
