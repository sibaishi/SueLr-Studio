import { ModalSurface } from '@/ui/ModalSurface';
import type { ReactNode } from 'react';

export function SettingsModal({
  children,
  onClose,
  theme,
}: { children: ReactNode; onClose: () => void; theme?: 'dark' | 'light' }) {
  return (
    <ModalSurface
      ariaLabel="工作室设置"
      size="workspace"
      isolateKeyboard
      backdropLabel="关闭设置"
      rootProps={theme ? { 'data-theme': theme } : undefined}
      onClose={onClose}
    >
      {children}
    </ModalSurface>
  );
}
