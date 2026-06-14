import { cn } from '@/shared/ui/cn';
import { type ReactNode, memo } from 'react';

/* ------------------------------------------------------------------ */
/*  NodeAppendix — absolutely-positioned info bar outside a node       */
/* ------------------------------------------------------------------ */

type NodeAppendixProps = {
  /** top | bottom */
  position: 'top' | 'bottom';
  children: ReactNode;
  className?: string;
  /** If true, only visible on parent group hover. Default true. */
  showOnHover?: boolean;
};

export const NodeAppendix = memo(function NodeAppendix({
  position,
  children,
  className,
  showOnHover = true,
}: NodeAppendixProps) {
  return (
    <div
      className={cn(
        'absolute left-1/2 -translate-x-1/2',
        'flex items-center gap-1',
        showOnHover && 'opacity-0 group-hover:opacity-100 transition-opacity duration-150',
        className,
      )}
      style={{
        [position === 'top' ? 'top' : 'bottom']: 'var(--appendix-offset, -40px)',
      }}
    >
      {children}
    </div>
  );
});
